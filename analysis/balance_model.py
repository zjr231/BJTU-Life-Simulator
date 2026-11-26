#!/usr/bin/env python3
"""从步级导出中估计行动对即时状态、学期成绩和退出风险的影响。"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

DELTA_OUTCOMES = [
    "preparation_delta",
    "money_delta",
    "social_delta",
    "fitness_delta",
    "mood_delta",
    "energy_delta",
    "time_delta",
]
BEFORE_CONTROLS = [
    "time_before",
    "energy_before",
    "money_before",
    "social_before",
    "fitness_before",
    "mood_before",
    "preparation_before",
]


def read_csv(directory: Path, name: str) -> pd.DataFrame:
    file = directory / name
    if not file.exists():
        return pd.DataFrame()
    return pd.read_csv(file, encoding="utf-8-sig", keep_default_na=False)


def numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def grouped_actions(steps: pd.DataFrame, minimum: int = 10) -> pd.DataFrame:
    if steps.empty or "action" not in steps:
        return steps
    output = steps.copy()
    counts = output["action"].value_counts()
    rare = set(counts[counts < minimum].index)
    output["action_model"] = output["action"].map(lambda value: "other" if value in rare else value)
    return output


def design_matrix(df: pd.DataFrame, actions: str = "action_model") -> pd.DataFrame:
    parts = []
    if actions in df:
        parts.append(pd.get_dummies(df[actions], prefix="action", drop_first=True, dtype=float))
    if "term" in df:
        term = numeric(df["term"]).fillna(0).astype(int).astype(str)
        parts.append(pd.get_dummies(term, prefix="term", drop_first=True, dtype=float))
    controls = pd.DataFrame(index=df.index)
    for column in BEFORE_CONTROLS:
        if column in df:
            value = numeric(df[column])
            controls[column] = value.fillna(value.median())
    if "investment_amount" in df:
        value = numeric(df["investment_amount"]).fillna(0)
        controls["investment_amount"] = value
    parts.append(controls)
    matrix = pd.concat(parts, axis=1) if parts else pd.DataFrame(index=df.index)
    matrix = matrix.loc[:, matrix.nunique(dropna=False) > 1]
    matrix = sm.add_constant(matrix, has_constant="add")
    return matrix.astype(float)


def fit_cluster_ols(df: pd.DataFrame, outcome: str) -> tuple[pd.DataFrame, str] | tuple[None, str]:
    if outcome not in df:
        return None, "缺少因变量"
    y = numeric(df[outcome])
    mask = y.notna()
    data = df.loc[mask].copy()
    data[outcome] = y.loc[mask]
    if len(data) < 20:
        return None, "样本少于 20 步"
    action_counts = data["action_model"].value_counts() if "action_model" in data else pd.Series(dtype=int)
    if len(action_counts) < 2:
        return None, "至少需要两类行动"
    try:
        X = design_matrix(data)
        y = data[outcome].astype(float)
        model = sm.OLS(y, X, missing="drop")
        fitted = model.fit()
        result = fitted
        if data["run_id"].nunique() >= 2:
            groups = pd.factorize(data["run_id"])[0]
            result = fitted.get_robustcov_results(cov_type="cluster", groups=groups, use_correction=True)
        rows = []
        params = np.asarray(result.params)
        standard_errors = np.asarray(result.bse)
        p_values = np.asarray(result.pvalues)
        conf = np.asarray(result.conf_int())
        for index, name in enumerate(X.columns):
            if not name.startswith("action_"):
                continue
            rows.append({
                "outcome": outcome,
                "action": name.removeprefix("action_"),
                "coef": float(params[index]),
                "std_error": float(standard_errors[index]),
                "p_value": float(p_values[index]),
                "ci_low": float(conf[index][0]),
                "ci_high": float(conf[index][1]),
                "n": int(len(data)),
                "runs": int(data["run_id"].nunique()),
                "r_squared": float(fitted.rsquared),
            })
        return pd.DataFrame(rows), ""
    except Exception as error:  # statsmodels 在共线性或小样本下会拒绝估计
        return None, str(error)


def action_descriptives(steps: pd.DataFrame) -> pd.DataFrame:
    if steps.empty or "action" not in steps:
        return pd.DataFrame()
    data = steps.copy()
    for column in DELTA_OUTCOMES:
        if column in data:
            data[column] = numeric(data[column])
    data["time_cost"] = -data.get("time_delta", 0)
    data["energy_cost"] = -data.get("energy_delta", 0)
    group = data.groupby("action", dropna=False)
    output = group.agg(
        steps=("run_id", "size"),
        runs=("run_id", "nunique"),
        mean_preparation_delta=("preparation_delta", "mean"),
        mean_money_delta=("money_delta", "mean"),
        mean_social_delta=("social_delta", "mean"),
        mean_fitness_delta=("fitness_delta", "mean"),
        mean_mood_delta=("mood_delta", "mean"),
        mean_time_cost=("time_cost", "mean"),
        mean_energy_cost=("energy_cost", "mean"),
    ).reset_index()
    output["preparation_per_time"] = output["mean_preparation_delta"] / output["mean_time_cost"].replace(0, np.nan)
    output["preparation_per_energy"] = output["mean_preparation_delta"] / output["mean_energy_cost"].replace(0, np.nan)
    output["money_per_time"] = output["mean_money_delta"] / output["mean_time_cost"].replace(0, np.nan)
    return output.sort_values(["steps", "action"], ascending=[False, True])


def term_model(terms: pd.DataFrame, term_actions: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    if terms.empty or term_actions.empty:
        return pd.DataFrame(), "缺少学期行动或成绩表"
    counts = term_actions.groupby(["run_id", "term", "action"], dropna=False)["count"].sum().reset_index()
    if counts.empty:
        return pd.DataFrame(), "没有可用于学期模型的行动"
    top = counts.groupby("action")["count"].sum().sort_values(ascending=False).head(12).index
    counts = counts[counts["action"].isin(top)]
    wide = counts.pivot_table(index=["run_id", "term"], columns="action", values="count", aggfunc="sum", fill_value=0).reset_index()
    wide = wide.rename(columns={name: "action_" + str(name) for name in wide.columns if name not in ("run_id", "term")})
    data = terms.merge(wide, on=["run_id", "term"], how="inner")
    outcome = "grade"
    if data.empty or outcome not in data:
        return pd.DataFrame(), "学期成绩样本为空"
    data[outcome] = numeric(data[outcome])
    data = data[data[outcome].notna() & data["run_id"].notna()]
    if len(data) < 20:
        return pd.DataFrame(), "学期模型样本少于 20 个学期"
    try:
        X = pd.get_dummies(data["term"].astype(str), prefix="term", drop_first=True, dtype=float)
        action_columns = [column for column in data.columns if column.startswith("action_")]
        for column in action_columns:
            X[column] = numeric(data[column]).fillna(0).astype(float)
        X = sm.add_constant(X, has_constant="add").astype(float)
        fitted = sm.OLS(data[outcome].astype(float), X, missing="drop").fit()
        result = fitted
        if data["run_id"].nunique() >= 2:
            groups = pd.factorize(data["run_id"])[0]
            result = fitted.get_robustcov_results(cov_type="cluster", groups=groups, use_correction=True)
        rows = []
        params = np.asarray(result.params)
        standard_errors = np.asarray(result.bse)
        p_values = np.asarray(result.pvalues)
        for index, name in enumerate(X.columns):
            if not name.startswith("action_"):
                continue
            rows.append({
                "term": "all",
                "feature": name,
                "coef": float(params[index]),
                "std_error": float(standard_errors[index]),
                "p_value": float(p_values[index]),
                "n": int(len(data)),
                "runs": int(data["run_id"].nunique()),
                "r_squared": float(fitted.rsquared),
            })
        return pd.DataFrame(rows), ""
    except Exception as error:
        return pd.DataFrame(), str(error)


def final_model(runs: pd.DataFrame, steps: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    if runs.empty or steps.empty or "average" not in runs:
        return pd.DataFrame(), "缺少对局结果或步级行动表"
    data = runs.copy()
    data["average"] = numeric(data["average"])
    data = data[data["average"].notna() & data["run_id"].notna()]
    if len(data) < 10:
        return pd.DataFrame(), "对局结果样本少于 10 局"
    counts = steps.groupby(["run_id", "action"], dropna=False).size().reset_index(name="count")
    top = counts.groupby("action")["count"].sum().sort_values(ascending=False).head(15).index
    counts = counts[counts["action"].isin(top)]
    wide = counts.pivot_table(index="run_id", columns="action", values="count", aggfunc="sum", fill_value=0).reset_index()
    wide = wide.rename(columns={name: "action_" + str(name) for name in wide.columns if name != "run_id"})
    data = data.merge(wide, on="run_id", how="left").fillna(0)
    try:
        parts = []
        if "family_id" in data:
            parts.append(pd.get_dummies(data["family_id"].astype(str), prefix="family", drop_first=True, dtype=float))
        action_columns = [column for column in data.columns if column.startswith("action_")]
        if not action_columns:
            return pd.DataFrame(), "没有可用于最终结果模型的行动"
        parts.append(data[action_columns].astype(float))
        X = pd.concat(parts, axis=1)
        X = sm.add_constant(X, has_constant="add").astype(float)
        fitted = sm.OLS(data["average"].astype(float), X, missing="drop").fit()
        rows = []
        params = np.asarray(fitted.params)
        standard_errors = np.asarray(fitted.bse)
        p_values = np.asarray(fitted.pvalues)
        for index, name in enumerate(X.columns):
            if not name.startswith("action_"):
                continue
            rows.append({
                "outcome": "final_average",
                "feature": name,
                "coef": float(params[index]),
                "std_error": float(standard_errors[index]),
                "p_value": float(p_values[index]),
                "n": int(len(data)),
                "r_squared": float(fitted.rsquared),
            })
        return pd.DataFrame(rows), ""
    except Exception as error:
        return pd.DataFrame(), str(error)


def exit_model(runs: pd.DataFrame, term_actions: pd.DataFrame) -> tuple[pd.DataFrame, str]:
    if runs.empty or term_actions.empty:
        return pd.DataFrame(), "缺少对局或学期行动表"
    needed = {"run_id", "final_term", "latest_snapshot_kind", "final_phase"}
    if not needed.issubset(runs.columns):
        return pd.DataFrame(), "对局表缺少退出字段"
    panel_rows = []
    for _, run in runs.iterrows():
        try:
            final_term = int(float(run.get("final_term", 8)))
        except (TypeError, ValueError):
            continue
        if final_term < 1 or final_term > 8:
            continue
        exited = str(run.get("latest_snapshot_kind", "")) == "exit" and str(run.get("final_phase", "")) not in ("finished", "ended")
        for term in range(1, final_term + 1):
            panel_rows.append({
                "run_id": run["run_id"],
                "term": term,
                "exit_after_term": 1 if exited and term == final_term else 0,
            })
    if not panel_rows:
        return pd.DataFrame(), "没有可用的学期退出面板"
    panel = pd.DataFrame(panel_rows)
    counts = term_actions.groupby(["run_id", "term", "action"], dropna=False)["count"].sum().reset_index()
    top = counts.groupby("action")["count"].sum().sort_values(ascending=False).head(12).index
    counts = counts[counts["action"].isin(top)]
    wide = counts.pivot_table(index=["run_id", "term"], columns="action", values="count", aggfunc="sum", fill_value=0).reset_index()
    wide = wide.rename(columns={name: "action_" + str(name) for name in wide.columns if name not in ("run_id", "term")})
    data = panel.merge(wide, on=["run_id", "term"], how="left").fillna(0)
    events = int(data["exit_after_term"].sum())
    if events < 5:
        return pd.DataFrame(), f"明确退出事件只有 {events} 个，暂不估计"
    try:
        X = pd.get_dummies(data["term"].astype(str), prefix="term", drop_first=True, dtype=float)
        for column in [item for item in data.columns if item.startswith("action_")]:
            X[column] = numeric(data[column]).fillna(0).astype(float)
        X = sm.add_constant(X, has_constant="add").astype(float)
        fitted = sm.Logit(data["exit_after_term"].astype(float), X, missing="drop").fit(disp=False, maxiter=300)
        rows = []
        params = np.asarray(fitted.params)
        standard_errors = np.asarray(fitted.bse)
        p_values = np.asarray(fitted.pvalues)
        for index, name in enumerate(X.columns):
            if not name.startswith("action_"):
                continue
            rows.append({
                "feature": name,
                "coef": float(params[index]),
                "std_error": float(standard_errors[index]),
                "p_value": float(p_values[index]),
                "odds_ratio": float(math.exp(params[index])),
                "n": int(len(data)),
                "runs": int(data["run_id"].nunique()),
                "events": events,
            })
        return pd.DataFrame(rows), ""
    except Exception as error:
        return pd.DataFrame(), str(error)


def fmt(value: object, digits: int = 2) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, (float, np.floating)):
        if math.isnan(value) or math.isinf(value):
            return "—"
        return f"{value:.{digits}f}"
    return str(value)


def markdown_table(frame: pd.DataFrame, columns: list[str], limit: int = 12) -> str:
    if frame.empty:
        return "没有足够样本。\n"
    rows = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for _, row in frame.head(limit).iterrows():
        rows.append("| " + " | ".join(fmt(row.get(column)) for column in columns) + " |")
    return "\n".join(rows) + "\n"


def build_markdown(data_dir: Path, runs: pd.DataFrame, steps: pd.DataFrame, terms: pd.DataFrame,
                   descriptives: pd.DataFrame, effects: pd.DataFrame, final_effects: pd.DataFrame,
                   term_effects: pd.DataFrame, exit_effects: pd.DataFrame,
                   term_error: str, final_error: str, exit_error: str) -> str:
    feedback = read_csv(data_dir, "feedback.csv")
    lines = [
        "# 北交人生 · 玩家行动与数值平衡分析",
        "",
        f"- 导出目录：`{data_dir}`",
        f"- 对局数：**{len(runs)}**",
        f"- 步级操作：**{len(steps)}**",
        f"- 学期样本：**{len(terms)}**",
        f"- 反馈条目：**{len(feedback)}**",
        "",
        "## 数据口径",
        "",
        "每个 `game_saves` 快照保存了完整 `history`。分析脚本按同一种子重放命令序列，记录每一步操作前后的完整状态，因此 `steps.csv` 是步级面板，而不是局级汇总。",
        "",
        "## 即时影响",
        "",
        "下表按行动统计步级平均变化。时间/精力成本为负值取反后的平均值；收益越高、成本越低，越需要复核是否存在过强行动。",
        "",
        "### 行动频率与收益",
        "",
        markdown_table(descriptives, ["action", "steps", "runs", "mean_preparation_delta", "mean_time_cost", "mean_energy_cost", "mean_money_delta"]),
        "",
        "### 单位成本收益",
        "",
        markdown_table(descriptives, ["action", "preparation_per_time", "preparation_per_energy", "money_per_time"], limit=16),
        "",
    ]
    if not effects.empty:
        for outcome in DELTA_OUTCOMES:
            subset = effects[(effects["outcome"] == outcome) & effects["coef"].notna()].copy()
            if subset.empty:
                continue
            subset["abs_coef"] = subset["coef"].abs()
            subset = subset.sort_values("abs_coef", ascending=False)
            lines += [f"### `{outcome}` 的条件关联", "", markdown_table(subset, ["action", "coef", "std_error", "ci_low", "ci_high", "p_value", "n", "runs"]), ""]
    lines += [
        "## 最终平均成绩的探索性关联",
        "",
        "这一节把整局行动次数与最终平均成绩关联，并控制家庭背景。它适合发现“长期堆某类行动”的异常收益，不适合替代学期面板或反事实重放。",
        "",
    ]
    if final_effects.empty:
        lines += [f"最终结果模型未估计：`{final_error or '样本不足'}`。", ""]
    else:
        final_effects = final_effects.copy()
        final_effects["abs_coef"] = final_effects["coef"].abs()
        final_effects = final_effects.sort_values("abs_coef", ascending=False)
        lines += [markdown_table(final_effects, ["feature", "coef", "std_error", "p_value", "n", "r_squared"], limit=20), ""]
    lines += [
        "## 学期成绩模型",
        "",
        "模型把本学期各行动的完成次数与期末总评关联起来，并控制学期固定效应。它描述的是“同学期行动组合与成绩的条件关联”，不是因果效应。",
        "",
        markdown_table(term_effects, ["feature", "coef", "std_error", "p_value", "n", "runs", "r_squared"], limit=20),
        "",
    ]
    if term_error:
        lines += [f"学期模型未估计：`{term_error}`。", ""]
    lines += [
        "## 学期后退出风险",
        "",
        "退出事件来自玩家在游戏内主动退出时上传的 `exit` 快照；直接关闭浏览器标签页无法可靠记录，因此这是下限样本，不是完整流失率。",
        "",
    ]
    if exit_effects.empty:
        lines += [f"退出模型未估计：`{exit_error or '样本不足'}`。", ""]
    else:
        exit_effects = exit_effects.copy()
        exit_effects["abs_coef"] = exit_effects["coef"].abs()
        exit_effects = exit_effects.sort_values("abs_coef", ascending=False)
        lines += [markdown_table(exit_effects, ["feature", "coef", "std_error", "p_value", "odds_ratio", "n", "runs", "events"], limit=20), ""]
    lines += [
        "## 如何用于平衡调整",
        "",
        "1. 先看 `steps.csv` 中每类行动的即时收益与成本，再看 `terms.csv`、`term_actions.csv` 和 `action_effects.csv` 中成绩和资源的滞后关联。",
        "2. 高使用率、高单位收益、低成本的行动优先复核；低使用率、低收益或高门槛的行动优先检查是否被事件、资源或时间窗口挤掉。",
        "3. 预算、家庭背景和学期阶段是强上下文变量，建议按学期和预算档位拆分复核，不要只看全局平均。",
        "4. 观察性数据会受到玩家自选择影响。回归系数是条件关联，不应当直接当成“把某个行动改强/改弱后结果一定变化多少”。要验证单项改动，优先用同一种子和操作序列做反事实重放。",
        "5. 小样本行动先补数据或合并为行动族，不要根据几条记录调数值。",
        "",
        "## 反馈",
        "",
        markdown_table(feedback, ["source", "snapshot_term", "snapshot_ending", "suggestion"], limit=30),
        "",
        "反馈文本只用于人工归纳；不要把它当作数值回归的因变量。",
        "",
        "## 输出文件",
        "",
        "- `action_descriptives.csv`：行动频率、即时收益、单位时间/精力收益。",
        "- `action_effects.csv`：步级固定效应回归的行动系数和聚类标准误。",
        "- `outcome_effects.csv`：整局行动次数与最终平均成绩的探索性关联。",
        "- `term_effects.csv`：学期成绩模型系数。",
        "- `exit_hazard.csv`：主动退出风险的探索性 Logit 系数。",
        "- `analysis_manifest.json`：样本量、模型状态和运行参数。",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="北交人生步级回归与平衡分析")
    parser.add_argument("--input", default="analysis-output", help="playthrough-report 输出目录")
    parser.add_argument("--output", default="balance-output", help="分析结果目录")
    args = parser.parse_args()
    data_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    runs = read_csv(data_dir, "runs.csv")
    steps = read_csv(data_dir, "steps.csv")
    terms = read_csv(data_dir, "terms.csv")
    term_actions = read_csv(data_dir, "term_actions.csv")
    steps = grouped_actions(steps)
    descriptives = action_descriptives(steps)
    effect_frames, errors = [], []
    for outcome in DELTA_OUTCOMES:
        frame, error = fit_cluster_ols(steps, outcome)
        if frame is not None:
            effect_frames.append(frame)
        elif error:
            errors.append(f"{outcome}: {error}")
    effects = pd.concat(effect_frames, ignore_index=True) if effect_frames else pd.DataFrame()
    final_effects, final_error = final_model(runs, steps)
    term_effects, term_error = term_model(terms, term_actions)
    exit_effects, exit_error = exit_model(runs, term_actions)
    descriptives.to_csv(output_dir / "action_descriptives.csv", index=False)
    effects.to_csv(output_dir / "action_effects.csv", index=False)
    final_effects.to_csv(output_dir / "outcome_effects.csv", index=False)
    term_effects.to_csv(output_dir / "term_effects.csv", index=False)
    exit_effects.to_csv(output_dir / "exit_hazard.csv", index=False)
    report = build_markdown(data_dir, runs, steps, terms, descriptives, effects, final_effects, term_effects, exit_effects, term_error, final_error, exit_error)
    (output_dir / "balance_report.md").write_text(report, encoding="utf-8")
    manifest = {
        "input": str(data_dir),
        "runs": int(len(runs)),
        "steps": int(len(steps)),
        "term_rows": int(len(terms)),
        "feedback_rows": int(len(read_csv(data_dir, "feedback.csv"))),
        "action_effect_rows": int(len(effects)),
        "outcome_effect_rows": int(len(final_effects)),
        "term_effect_rows": int(len(term_effects)),
        "exit_effect_rows": int(len(exit_effects)),
        "errors": errors + ([final_error] if final_error else []) + ([term_error] if term_error else []) + ([exit_error] if exit_error else []),
    }
    (output_dir / "analysis_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(output_dir)


if __name__ == "__main__":
    main()
