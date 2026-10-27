(function (root) {
  'use strict';
  // 课程目录只保存稳定的课程元数据；题库按学科分类，考试时从所选课程对应学科抽取。
  const SUBJECTS = { math: '数学', physics: '物理', cs: '计算机', engineering: '工程', management: '经管', general: '通识' };
  const COURSES = [
    { id: 'calc1', name: '高等数学A（上）', subject: 'math', credits: 5, term: 1, background: 'common', description: '极限、导数与积分，一门需要持续投入的基础课。' },
    { id: 'english1', name: '大学英语I', subject: 'general', credits: 3, term: 1, background: 'common', description: '听说读写综合训练，课堂互动比高中多。' },
    { id: 'ethics', name: '思想道德与法治', subject: 'general', credits: 3, term: 1, background: 'common', description: '从校园生活讲到社会规范，考核以理解和表达为主。' },
    { id: 'pe1', name: '体育I', subject: 'general', credits: 1, term: 1, background: 'common', description: '体能与项目练习，期末有统一的体测要求。' },
    { id: 'introCs', name: '程序设计基础', subject: 'cs', credits: 4, term: 1, background: 'information', description: '从变量和分支写到函数，第一次把想法变成程序。' },
    { id: 'drawing', name: '工程制图基础', subject: 'engineering', credits: 3, term: 1, background: 'engineering', description: '三视图、剖视图和尺寸标注，图纸是工程师的语言。' },
    { id: 'managementIntro', name: '管理学原理', subject: 'management', credits: 3, term: 1, background: 'management', description: '计划、组织、领导和控制，理解组织如何运转。' },

    { id: 'calc2', name: '高等数学A（下）', subject: 'math', credits: 5, term: 2, background: 'common', description: '多元函数、重积分与级数，计算量明显上来。' },
    { id: 'linearAlgebra', name: '线性代数', subject: 'math', credits: 3, term: 2, background: 'common', description: '矩阵、向量空间与线性变换，很多专业课的地基。' },
    { id: 'physics1', name: '大学物理I', subject: 'physics', credits: 4, term: 2, background: 'common', description: '力学与热学，用微积分描述自然界的运动。' },
    { id: 'english2', name: '大学英语II', subject: 'general', credits: 3, term: 2, background: 'common', description: '长篇阅读与学术写作入门，开始积累专业词汇。' },
    { id: 'modernHistory', name: '中国近现代史纲要', subject: 'general', credits: 3, term: 2, background: 'common', description: '从近代变局读到现代中国，重视时间线与因果关系。' },
    { id: 'dataStructures', name: '数据结构', subject: 'cs', credits: 4, term: 2, background: 'information', description: '线性表、树、图与查找排序，写代码前先想清楚结构。' },
    { id: 'mechanics', name: '理论力学', subject: 'engineering', credits: 4, term: 2, background: 'engineering', description: '静力学与运动学，受力分析要一步一步来。' },
    { id: 'microEconomics', name: '微观经济学', subject: 'management', credits: 3, term: 2, background: 'management', description: '从供需和边际分析出发，理解个体如何做选择。' },

    { id: 'probability', name: '概率论与数理统计', subject: 'math', credits: 4, term: 3, background: 'common', description: '随机变量、分布与参数估计，考试很看重计算。' },
    { id: 'physics2', name: '大学物理II', subject: 'physics', credits: 4, term: 3, background: 'common', description: '电磁学与光学，实验和理论需要互相印证。' },
    { id: 'english3', name: '大学英语III', subject: 'general', credits: 3, term: 3, background: 'common', description: '学术听力与小组展示，开始训练公开表达。' },
    { id: 'marxism', name: '马克思主义基本原理', subject: 'general', credits: 3, term: 3, background: 'common', description: '概念多、体系强，适合按专题整理笔记。' },
    { id: 'algorithms', name: '算法设计与分析', subject: 'cs', credits: 4, term: 3, background: 'information', description: '分治、动态规划与贪心，复杂度分析贯穿全程。' },
    { id: 'materials', name: '材料力学', subject: 'engineering', credits: 4, term: 3, background: 'engineering', description: '应力、应变与强度校核，公式背后是工程安全。' },
    { id: 'accounting', name: '会计学原理', subject: 'management', credits: 3, term: 3, background: 'management', description: '借贷记账与报表阅读，数字要能对上。' },

    { id: 'numerical', name: '数值分析', subject: 'math', credits: 3, term: 4, background: 'common', description: '用计算机求解数学问题，误差分析比结果更重要。' },
    { id: 'physicsLab', name: '大学物理实验', subject: 'physics', credits: 2, term: 4, background: 'common', description: '测量、记录与误差处理，实验报告占很大比重。' },
    { id: 'english4', name: '大学英语IV', subject: 'general', credits: 3, term: 4, background: 'common', description: '学术阅读与论文摘要，开始接触英文文献。' },
    { id: 'maoism', name: '毛泽东思想和中国特色社会主义理论体系概论', subject: 'general', credits: 3, term: 4, background: 'common', description: '理论联系实际，课堂讨论和材料分析较多。' },
    { id: 'operatingSystems', name: '操作系统', subject: 'cs', credits: 4, term: 4, background: 'information', description: '进程、内存、文件与调度，理解程序如何真正运行。' },
    { id: 'structural', name: '结构力学', subject: 'engineering', credits: 4, term: 4, background: 'engineering', description: '从静定到超静定结构，弯矩图是绕不开的基本功。' },
    { id: 'marketing', name: '市场营销学', subject: 'management', credits: 3, term: 4, background: 'management', description: '市场细分、定位与营销组合，案例讨论很多。' },

    { id: 'optimization', name: '最优化方法', subject: 'math', credits: 3, term: 5, background: 'common', description: '线性规划与无约束优化，建模和求解同样重要。' },
    { id: 'english5', name: '学术英语', subject: 'general', credits: 3, term: 5, background: 'common', description: '文献检索、学术表达与论文结构，为高年级做准备。' },
    { id: 'politicalEconomy', name: '政治经济学', subject: 'general', credits: 3, term: 5, background: 'common', description: '从经典理论理解经济制度与运行机制。' },
    { id: 'database', name: '数据库系统', subject: 'cs', credits: 4, term: 5, background: 'information', description: '关系模型、SQL 与事务，数据要存得住也查得快。' },
    { id: 'networks', name: '计算机网络', subject: 'cs', credits: 4, term: 5, background: 'information', description: '分层协议与网络互连，抓包能看见理论怎么落地。' },
    { id: 'construction', name: '土木工程施工', subject: 'engineering', credits: 3, term: 5, background: 'engineering', description: '施工组织、工序与质量控制，现场经验很重要。' },
    { id: 'engineeringGeology', name: '工程地质', subject: 'engineering', credits: 3, term: 5, background: 'engineering', description: '岩土性质与地质勘察，工程选址前要先读懂地面以下。' },
    { id: 'corporateFinance', name: '公司金融', subject: 'management', credits: 4, term: 5, background: 'management', description: '投资决策、融资结构与估值，计算和判断并重。' },
    { id: 'humanResource', name: '人力资源管理', subject: 'management', credits: 3, term: 5, background: 'management', description: '招聘、绩效、薪酬与组织发展，核心是人和制度。' },

    { id: 'statistics', name: '应用统计学', subject: 'math', credits: 3, term: 6, background: 'common', description: '假设检验与回归分析，学会从数据里得出结论。' },
    { id: 'english6', name: '专业英语', subject: 'general', credits: 2, term: 6, background: 'common', description: '阅读专业文献与撰写英文说明，词汇量决定速度。' },
    { id: 'law', name: '经济法', subject: 'general', credits: 3, term: 6, background: 'common', description: '合同、公司与市场秩序，案例题需要抓住要件。' },
    { id: 'softwareEngineering', name: '软件工程', subject: 'cs', credits: 4, term: 6, background: 'information', description: '需求、设计、测试与团队协作，项目文档占分不少。' },
    { id: 'embedded', name: '嵌入式系统', subject: 'cs', credits: 4, term: 6, background: 'information', description: '从单片机到实时系统，软硬件边界开始模糊。' },
    { id: 'transport', name: '交通工程', subject: 'engineering', credits: 4, term: 6, background: 'engineering', description: '交通流、道路设计与信号控制，和城市日常紧密相关。' },
    { id: 'engineeringEconomics', name: '工程经济学', subject: 'engineering', credits: 3, term: 6, background: 'engineering', description: '用现金流和折现率比较方案，工程决策不只看技术。' },
    { id: 'operations', name: '运营管理', subject: 'management', credits: 3, term: 6, background: 'management', description: '产能、库存与流程优化，追求效率和成本的平衡。' },
    { id: 'internationalBusiness', name: '国际商务', subject: 'management', credits: 3, term: 6, background: 'management', description: '跨市场经营、汇率与供应链，视角从校内拉到全球。' },

    { id: 'bigData', name: '大数据技术', subject: 'cs', credits: 4, term: 7, background: 'information', description: '分布式存储与计算，数据规模上来后思路会变。' },
    { id: 'ai', name: '人工智能导论', subject: 'cs', credits: 4, term: 7, background: 'information', description: '搜索、学习与推理，理解常见算法的适用边界。' },
    { id: 'bridge', name: '桥梁工程', subject: 'engineering', credits: 4, term: 7, background: 'engineering', description: '桥型、受力与施工，结构安全需要反复验算。' },
    { id: 'seismicDesign', name: '建筑抗震设计', subject: 'engineering', credits: 3, term: 7, background: 'engineering', description: '从地震作用到构造措施，理解结构抗震的基本逻辑。' },
    { id: 'projectManagement', name: '项目管理', subject: 'management', credits: 3, term: 7, background: 'management', description: '范围、进度、成本与风险，计划要能落地。' },
    { id: 'investment', name: '投资学', subject: 'management', credits: 4, term: 7, background: 'management', description: '收益与风险、资产组合和市场有效性，计算题较多。' },
    { id: 'strategicManagement', name: '战略管理', subject: 'management', credits: 3, term: 7, background: 'management', description: '从行业分析到竞争策略，练习在不确定中做判断。' },
    { id: 'professionalEnglish', name: '专业英语文献阅读', subject: 'general', credits: 2, term: 7, background: 'common', description: '精读英文论文，训练摘要和批判性阅读。' },
    { id: 'academicWriting', name: '学术写作', subject: 'general', credits: 2, term: 7, background: 'common', description: '从选题到引用，把研究过程写成规范的文本。' },
    { id: 'researchMethods', name: '研究方法导论', subject: 'general', credits: 2, term: 7, background: 'common', description: '问题、文献、数据与论证，为毕业设计打基础。' },

    { id: 'careerPlanning', name: '职业生涯规划', subject: 'general', credits: 2, term: 8, background: 'common', description: '梳理能力与目标，把毕业选择落到具体行动。' },
    { id: 'innovation', name: '创新创业基础', subject: 'general', credits: 2, term: 8, background: 'common', description: '从问题发现到商业计划，重视团队和可行性。' },
    { id: 'graduationSeminar', name: '毕业专题研讨', subject: 'general', credits: 2, term: 8, background: 'common', description: '围绕毕业设计做汇报和互评，把思路讲清楚。' },
    { id: 'professionalEthics', name: '工程职业伦理', subject: 'general', credits: 2, term: 8, background: 'common', description: '用案例讨论工程师的责任、风险和公共安全。' },
    { id: 'graduationCs', name: '毕业设计（信息类）', subject: 'cs', credits: 8, term: 8, background: 'information', description: '把四年学到的知识收束到一个完整作品里。' },
    { id: 'graduationEng', name: '毕业设计（工程类）', subject: 'engineering', credits: 8, term: 8, background: 'engineering', description: '从方案到计算书，完整走一遍工程实践流程。' },
    { id: 'graduationMgmt', name: '毕业设计（经管类）', subject: 'management', credits: 8, term: 8, background: 'management', description: '用数据和理论回答一个真实的管理问题。' }
  ];

  const QUESTIONS = {
    math: [
      { id: 'math-1', prompt: '当 x 趋近于 0 时，sin(3x)/x 的极限是？', options: ['0', '1', '3', '不存在'], answer: 2 },
      { id: 'math-2', prompt: '函数 f(x)=x²eˣ 的导数是？', options: ['2xeˣ', 'eˣ(x²+2x)', 'x²eˣ', 'eˣ(x+2)'], answer: 1 },
      { id: 'math-3', prompt: '定积分 ∫₀¹ 2x dx 的值是？', options: ['1', '2', '1/2', '0'], answer: 0 },
      { id: 'math-4', prompt: '矩阵 [[1,2],[3,4]] 的行列式是？', options: ['-2', '2', '10', '-10'], answer: 0 },
      { id: 'math-5', prompt: '同时掷两枚公平骰子，点数之和为 7 的概率是？', options: ['1/12', '1/9', '1/6', '1/3'], answer: 2 },
      { id: 'math-6', prompt: '函数 ln(x²+1) 的导数是？', options: ['1/(x²+1)', '2x/(x²+1)', '2x', 'x/(x²+1)'], answer: 1 },
      { id: 'math-7', prompt: '级数 ∑(1/2ⁿ)（n 从 1 到无穷）的和是？', options: ['1/2', '1', '2', '发散'], answer: 1 },
      { id: 'math-8', prompt: '函数 f(x)=x³−3x 的极大值点在？', options: ['x=−1', 'x=1', 'x=0', 'x=3'], answer: 0 }
    ],
    cs: [
      { id: 'cs-1', prompt: '二进制数 1011 对应的十进制数是？', options: ['9', '10', '11', '13'], answer: 2 },
      { id: 'cs-2', prompt: '栈这种数据结构遵循的原则是？', options: ['先进先出', '后进先出', '随机存取', '按优先级出队'], answer: 1 },
      { id: 'cs-3', prompt: '在数组中按下标访问元素，平均时间复杂度是？', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answer: 0 },
      { id: 'cs-4', prompt: 'SQL 中用于查询数据的关键字是？', options: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], answer: 0 },
      { id: 'cs-5', prompt: '同一进程内的多个线程通常共享？', options: ['寄存器', '栈', '地址空间', '程序计数器'], answer: 2 },
      { id: 'cs-6', prompt: '哈希表在理想情况下的平均查找复杂度是？', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], answer: 0 },
      { id: 'cs-7', prompt: '与 TCP 相比，UDP 的主要特点是？', options: ['面向连接', '可靠传输', '无连接、开销小', '自动重传'], answer: 2 },
      { id: 'cs-8', prompt: '递归函数必须包含什么，才能避免无限递归？', options: ['循环变量', '终止条件', '全局变量', '静态变量'], answer: 1 }
    ],
    physics: [
      { id: 'physics-1', prompt: '质量为 2 kg 的物体受到 6 N 的合力，加速度是？', options: ['1 m/s²', '2 m/s²', '3 m/s²', '12 m/s²'], answer: 2 },
      { id: 'physics-2', prompt: '忽略空气阻力，物体自由下落 2 s 的位移约为（g 取 10 m/s²）？', options: ['10 m', '20 m', '30 m', '40 m'], answer: 1 },
      { id: 'physics-3', prompt: '质量为 m、速度为 v 的物体，动能是？', options: ['mv', 'mv²', '½mv²', '½mv'], answer: 2 },
      { id: 'physics-4', prompt: '欧姆定律的表达式是？', options: ['U=IR', 'U=I/R', 'I=UR', 'R=UI'], answer: 0 },
      { id: 'physics-5', prompt: '波速、频率与波长的关系是？', options: ['波速=频率×波长', '波速=频率/波长', '波长=频率×波速', '频率=波速×波长'], answer: 0 },
      { id: 'physics-6', prompt: '在不受外力的孤立系统中，总动量？', options: ['不断增大', '不断减小', '保持不变', '与时间成正比'], answer: 2 },
      { id: 'physics-7', prompt: '恒力 F 作用在物体上，位移为 d，夹角为 θ，做功为？', options: ['Fd', 'Fd sinθ', 'Fd cosθ', 'F/d'], answer: 2 },
      { id: 'physics-8', prompt: '功率的国际单位是？', options: ['焦耳', '瓦特', '牛顿', '帕斯卡'], answer: 1 }
    ],
    engineering: [
      { id: 'engineering-1', prompt: '正应力 σ 的定义是？', options: ['力乘以面积', '力除以面积', '面积除以力', '力除以长度'], answer: 1 },
      { id: 'engineering-2', prompt: '结构设计中安全系数通常应？', options: ['小于 1', '等于 1', '大于 1', '等于 0'], answer: 2 },
      { id: 'engineering-3', prompt: '应变是一个什么量？', options: ['有单位的长度量', '无量纲量', '力的量', '质量的量'], answer: 1 },
      { id: 'engineering-4', prompt: '三角形桁架相比四边形框架更稳定的主要原因是？', options: ['材料更轻', '几何不变', '施工更快', '造价更低'], answer: 1 },
      { id: 'engineering-5', prompt: '绘制受力分析图时，首先应？', options: ['计算内力', '选择研究对象并隔离', '直接画弯矩图', '确定配筋'], answer: 1 },
      { id: 'engineering-6', prompt: '混凝土最擅长承受的荷载类型是？', options: ['拉力', '压力', '剪力', '扭矩'], answer: 1 },
      { id: 'engineering-7', prompt: '网络计划中，决定工期的线路称为？', options: ['关键线路', '辅助线路', '备用线路', '随机线路'], answer: 0 },
      { id: 'engineering-8', prompt: '梁在纯弯曲时，横截面上正应力沿高度通常如何分布？', options: ['均匀', '线性', '抛物线', '随机'], answer: 1 }
    ],
    management: [
      { id: 'management-1', prompt: '选择一种方案而放弃的其他方案中价值最高的，称为？', options: ['沉没成本', '机会成本', '固定成本', '边际成本'], answer: 1 },
      { id: 'management-2', prompt: '其他条件不变时，商品价格上升通常会使需求量？', options: ['增加', '减少', '不变', '先增后减'], answer: 1 },
      { id: 'management-3', prompt: '会计恒等式是？', options: ['资产=负债+所有者权益', '资产=收入+费用', '利润=资产+负债', '负债=资产+权益'], answer: 0 },
      { id: 'management-4', prompt: '多生产一单位产品所增加的成本称为？', options: ['平均成本', '固定成本', '边际成本', '机会成本'], answer: 2 },
      { id: 'management-5', prompt: 'SWOT 分析中的 “O” 指的是？', options: ['组织', '机会', '运营', '目标'], answer: 1 },
      { id: 'management-6', prompt: '不随产量变化而变化的成本是？', options: ['可变成本', '固定成本', '边际成本', '平均成本'], answer: 1 },
      { id: 'management-7', prompt: '一个项目净现值（NPV）大于 0，通常意味着？', options: ['项目一定亏损', '项目值得考虑', '项目没有风险', '项目周期很短'], answer: 1 },
      { id: 'management-8', prompt: '马斯洛需求层次理论中，最低层次的需求是？', options: ['安全需求', '生理需求', '社交需求', '自我实现'], answer: 1 }
    ],
    general: [
      { id: 'general-1', prompt: '中国近代史通常以哪一事件作为开端？', options: ['甲午战争', '鸦片战争', '辛亥革命', '五四运动'], answer: 1 },
      { id: 'general-2', prompt: '五四运动爆发于哪一年？', options: ['1911 年', '1919 年', '1921 年', '1937 年'], answer: 1 },
      { id: 'general-3', prompt: '北京交通大学的前身是？', options: ['京师大学堂', '铁路管理传习所', '南洋公学', '清华学堂'], answer: 1 },
      { id: 'general-4', prompt: '英文单词 “benefit” 最接近的中文意思是？', options: ['损害', '益处', '义务', '证据'], answer: 1 },
      { id: 'general-5', prompt: '“所有 A 都是 B，有些 B 是 C” 能必然推出？', options: ['所有 A 都是 C', '有些 A 是 C', '有些 A 不是 C', '以上都不能必然推出'], answer: 3 },
      { id: 'general-6', prompt: '论文中引用他人观点时，最重要的学术规范是？', options: ['改写后不必标注', '注明出处', '只引用中文文献', '删掉作者姓名'], answer: 1 },
      { id: 'general-7', prompt: '剧烈运动前进行热身的主要目的是？', options: ['增加体重', '降低体温', '减少受伤风险', '提高考试成绩'], answer: 2 },
      { id: 'general-8', prompt: '签订合同时，下列哪项通常属于合同必备内容？', options: ['双方姓名或名称', '双方星座', '双方爱好', '双方血型'], answer: 0 }
    ]
  };

  function courseById(id) {
    return COURSES.find((course) => course.id === id) || null;
  }
  function coursesForTerm(term, backgroundId) {
    return COURSES.filter((course) => course.term === term && (course.background === 'common' || course.background === backgroundId));
  }
  function generateExam(courseIds, seed, randomApi) {
    const courses = courseIds.map(courseById).filter(Boolean);
    if (courses.length !== courseIds.length || !courses.length) throw new Error('试卷课程无效');
    let rng = randomApi.create(String(seed));
    const next = () => { const drawn = randomApi.draw(rng); rng = drawn.rng; return drawn.number; };
    const used = new Set();
    const questions = [];
    const take = (subject, course) => {
      const pool = (QUESTIONS[subject] || []).filter((question) => !used.has(question.id));
      if (!pool.length) return false;
      const picked = pool[Math.min(pool.length - 1, Math.floor(next() * pool.length))];
      used.add(picked.id);
      questions.push({ ...picked, subject, courseId: course.id, courseName: course.name, points: 20 });
      return true;
    };
    for (const course of courses) take(course.subject, course);
    const subjects = [...new Set(courses.map((course) => course.subject))];
    while (questions.length < 5) {
      const subject = subjects[Math.min(subjects.length - 1, Math.floor(next() * subjects.length))];
      if (take(subject, courses[0])) continue;
      const fallback = Object.entries(QUESTIONS).flatMap(([key, list]) => list.filter((question) => !used.has(question.id)).map((question) => ({ key, question })));
      if (!fallback.length) break;
      const picked = fallback[Math.min(fallback.length - 1, Math.floor(next() * fallback.length))];
      used.add(picked.question.id);
      questions.push({ ...picked.question, subject: picked.key, courseId: courses[0].id, courseName: courses[0].name, points: 20 });
    }
    for (let index = questions.length - 1; index > 0; index--) {
      const swap = Math.min(index, Math.floor(next() * (index + 1)));
      [questions[index], questions[swap]] = [questions[swap], questions[index]];
    }
    if (questions.length !== 5) throw new Error('题库不足，无法生成 5 道题');
    return { questions, answers: [], score: null, submitted: false };
  }
  function ratingFor(grade) {
    if (grade >= 90) return '优秀';
    if (grade >= 80) return '良好';
    if (grade >= 70) return '中等';
    if (grade >= 60) return '及格';
    return '不及格';
  }
  function gradeFor(usualScore, examScore) {
    return Math.round(usualScore * 0.4 + examScore * 0.6);
  }
  const api = { SUBJECTS, COURSES, QUESTIONS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusCourses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
