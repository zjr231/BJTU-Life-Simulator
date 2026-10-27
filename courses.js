(function (root) {
  'use strict';
  // 课程目录保存稳定元数据；定量课程通过 topic 绑定算法生成器，其余课程使用学科题库。
  const SUBJECTS = {
    math: '数学', physics: '物理', cs: '计算机', software: '软件工程', ai: '人工智能',
    communication: '通信工程', electrical: '电气工程', mechanical: '机械工程',
    transport: '交通运输', civil: '土木工程', chemistry: '化学',
    engineering: '工程', management: '管理', economics: '经济学', finance: '金融学',
    accounting: '会计学', english: '英语', humanities: '人文', law: '法学', sports: '体育', general: '通识'
  };
  const COURSES = [
    { id: 'calc1', name: '高等数学A（上）', subject: 'math', topic: 'calculus', credits: 5, term: 1, background: 'common', description: '极限、导数与积分，一门需要持续投入的基础课。' },
    { id: 'english1', name: '大学英语I', subject: 'english', credits: 3, term: 1, background: 'common', description: '听说读写综合训练，课堂互动比高中多。' },
    { id: 'ethics', name: '思想道德与法治', subject: 'humanities', credits: 3, term: 1, background: 'common', description: '从校园生活讲到社会规范，考核以理解和表达为主。' },
    { id: 'pe1', name: '体育I', subject: 'sports', credits: 1, term: 1, background: 'common', description: '体能与项目练习，期末有统一的体测要求。' },
    { id: 'introCs', name: '程序设计基础', subject: 'cs', topic: 'binary', credits: 4, term: 1, background: 'information', description: '从变量和分支写到函数，第一次把想法变成程序。' },
    { id: 'drawing', name: '工程制图基础', subject: 'engineering', credits: 3, term: 1, background: 'engineering', description: '三视图、剖视图和尺寸标注，图纸是工程师的语言。' },
    { id: 'engineeringChemistry', name: '工科化学', subject: 'chemistry', credits: 2, term: 1, background: 'engineering', description: '物质组成、反应与平衡，为材料和环境类课程打底。' },
    { id: 'managementIntro', name: '管理学原理', subject: 'management', credits: 3, term: 1, background: 'management', description: '计划、组织、领导和控制，理解组织如何运转。' },

    { id: 'calc2', name: '高等数学A（下）', subject: 'math', topic: 'calculus', credits: 5, term: 2, background: 'common', description: '多元函数、重积分与级数，计算量明显上来。' },
    { id: 'linearAlgebra', name: '线性代数', subject: 'math', topic: 'linear', credits: 3, term: 2, background: 'common', description: '矩阵、向量空间与线性变换，很多专业课的地基。' },
    { id: 'physics1', name: '大学物理I', subject: 'physics', topic: 'mechanics', credits: 4, term: 2, background: 'common', description: '力学与热学，用微积分描述自然界的运动。' },
    { id: 'english2', name: '大学英语II', subject: 'english', credits: 3, term: 2, background: 'common', description: '长篇阅读与学术写作入门，开始积累专业词汇。' },
    { id: 'modernHistory', name: '中国近现代史纲要', subject: 'humanities', credits: 3, term: 2, background: 'common', description: '从近代变局读到现代中国，重视时间线与因果关系。' },
    { id: 'dataStructures', name: '数据结构', subject: 'cs', topic: 'complexity', credits: 4, term: 2, background: 'information', description: '线性表、树、图与查找排序，写代码前先想清楚结构。' },
    { id: 'mechanics', name: '理论力学', subject: 'mechanical', topic: 'mechanics', credits: 4, term: 2, background: 'engineering', description: '静力学与运动学，受力分析要一步一步来。' },
    { id: 'microEconomics', name: '微观经济学', subject: 'economics', topic: 'economics', credits: 3, term: 2, background: 'management', description: '从供需和边际分析出发，理解个体如何做选择。' },

    { id: 'probability', name: '概率论与数理统计', subject: 'math', topic: 'probability', credits: 4, term: 3, background: 'common', description: '随机变量、分布与参数估计，考试很看重计算。' },
    { id: 'physics2', name: '大学物理II', subject: 'physics', topic: 'circuits', credits: 4, term: 3, background: 'common', description: '电磁学与光学，实验和理论需要互相印证。' },
    { id: 'english3', name: '大学英语III', subject: 'english', credits: 3, term: 3, background: 'common', description: '学术听力与小组展示，开始训练公开表达。' },
    { id: 'marxism', name: '马克思主义基本原理', subject: 'humanities', credits: 3, term: 3, background: 'common', description: '概念多、体系强，适合按专题整理笔记。' },
    { id: 'algorithms', name: '算法设计与分析', subject: 'cs', topic: 'complexity', credits: 4, term: 3, background: 'information', description: '分治、动态规划与贪心，复杂度分析贯穿全程。' },
    { id: 'materials', name: '材料力学', subject: 'civil', topic: 'stress', credits: 4, term: 3, background: 'engineering', description: '应力、应变与强度校核，公式背后是工程安全。' },
    { id: 'accounting', name: '会计学原理', subject: 'accounting', topic: 'accounting', credits: 3, term: 3, background: 'management', description: '借贷记账与报表阅读，数字要能对上。' },

    { id: 'numerical', name: '数值分析', subject: 'math', topic: 'numerical', credits: 3, term: 4, background: 'common', description: '用计算机求解数学问题，误差分析比结果更重要。' },
    { id: 'physicsLab', name: '大学物理实验', subject: 'physics', topic: 'measurement', credits: 2, term: 4, background: 'common', description: '测量、记录与误差处理，实验报告占很大比重。' },
    { id: 'english4', name: '大学英语IV', subject: 'english', credits: 3, term: 4, background: 'common', description: '学术阅读与论文摘要，开始接触英文文献。' },
    { id: 'maoism', name: '毛泽东思想和中国特色社会主义理论体系概论', subject: 'humanities', credits: 3, term: 4, background: 'common', description: '理论联系实际，课堂讨论和材料分析较多。' },
    { id: 'operatingSystems', name: '操作系统', subject: 'cs', credits: 4, term: 4, background: 'information', description: '进程、内存、文件与调度，理解程序如何真正运行。' },
    { id: 'structural', name: '结构力学', subject: 'civil', topic: 'stress', credits: 4, term: 4, background: 'engineering', description: '从静定到超静定结构，弯矩图是绕不开的基本功。' },
    { id: 'marketing', name: '市场营销学', subject: 'management', credits: 3, term: 4, background: 'management', description: '市场细分、定位与营销组合，案例讨论很多。' },

    { id: 'optimization', name: '最优化方法', subject: 'math', topic: 'optimization', credits: 3, term: 5, background: 'common', description: '线性规划与无约束优化，建模和求解同样重要。' },
    { id: 'english5', name: '学术英语', subject: 'english', credits: 3, term: 5, background: 'common', description: '文献检索、学术表达与论文结构，为高年级做准备。' },
    { id: 'politicalEconomy', name: '政治经济学', subject: 'humanities', credits: 3, term: 5, background: 'common', description: '从经典理论理解经济制度与运行机制。' },
    { id: 'database', name: '数据库系统', subject: 'cs', credits: 4, term: 5, background: 'information', description: '关系模型、SQL 与事务，数据要存得住也查得快。' },
    { id: 'networks', name: '计算机网络', subject: 'communication', credits: 4, term: 5, background: 'information', description: '分层协议与网络互连，抓包能看见理论怎么落地。' },
    { id: 'construction', name: '土木工程施工', subject: 'civil', credits: 3, term: 5, background: 'engineering', description: '施工组织、工序与质量控制，现场经验很重要。' },
    { id: 'engineeringGeology', name: '工程地质', subject: 'civil', credits: 3, term: 5, background: 'engineering', description: '岩土性质与地质勘察，工程选址前要先读懂地面以下。' },
    { id: 'corporateFinance', name: '公司金融', subject: 'finance', topic: 'finance', credits: 4, term: 5, background: 'management', description: '投资决策、融资结构与估值，计算和判断并重。' },
    { id: 'humanResource', name: '人力资源管理', subject: 'management', credits: 3, term: 5, background: 'management', description: '招聘、绩效、薪酬与组织发展，核心是人和制度。' },

    { id: 'statistics', name: '应用统计学', subject: 'math', topic: 'statistics', credits: 3, term: 6, background: 'common', description: '假设检验与回归分析，学会从数据里得出结论。' },
    { id: 'english6', name: '专业英语', subject: 'english', credits: 2, term: 6, background: 'common', description: '阅读专业文献与撰写英文说明，词汇量决定速度。' },
    { id: 'law', name: '经济法', subject: 'law', credits: 3, term: 6, background: 'common', description: '合同、公司与市场秩序，案例题需要抓住要件。' },
    { id: 'softwareEngineering', name: '软件工程', subject: 'software', credits: 4, term: 6, background: 'information', description: '需求、设计、测试与团队协作，项目文档占分不少。' },
    { id: 'embedded', name: '嵌入式系统', subject: 'electrical', credits: 4, term: 6, background: 'information', description: '从单片机到实时系统，软硬件边界开始模糊。' },
    { id: 'transport', name: '交通工程', subject: 'transport', credits: 4, term: 6, background: 'engineering', description: '交通流、道路设计与信号控制，和城市日常紧密相关。' },
    { id: 'engineeringEconomics', name: '工程经济学', subject: 'engineering', topic: 'finance', credits: 3, term: 6, background: 'engineering', description: '用现金流和折现率比较方案，工程决策不只看技术。' },
    { id: 'operations', name: '运营管理', subject: 'management', topic: 'operations', credits: 3, term: 6, background: 'management', description: '产能、库存与流程优化，追求效率和成本的平衡。' },
    { id: 'internationalBusiness', name: '国际商务', subject: 'economics', topic: 'international', credits: 3, term: 6, background: 'management', description: '跨市场经营、汇率与供应链，视角从校内拉到全球。' },

    { id: 'bigData', name: '大数据技术', subject: 'cs', credits: 4, term: 7, background: 'information', description: '分布式存储与计算，数据规模上来后思路会变。' },
    { id: 'ai', name: '人工智能导论', subject: 'ai', credits: 4, term: 7, background: 'information', description: '搜索、学习与推理，理解常见算法的适用边界。' },
    { id: 'bridge', name: '桥梁工程', subject: 'civil', topic: 'stress', credits: 4, term: 7, background: 'engineering', description: '桥型、受力与施工，结构安全需要反复验算。' },
    { id: 'seismicDesign', name: '建筑抗震设计', subject: 'civil', credits: 3, term: 7, background: 'engineering', description: '从地震作用到构造措施，理解结构抗震的基本逻辑。' },
    { id: 'projectManagement', name: '项目管理', subject: 'management', topic: 'project', credits: 3, term: 7, background: 'management', description: '范围、进度、成本与风险，计划要能落地。' },
    { id: 'investment', name: '投资学', subject: 'finance', topic: 'finance', credits: 4, term: 7, background: 'management', description: '收益与风险、资产组合和市场有效性，计算题较多。' },
    { id: 'strategicManagement', name: '战略管理', subject: 'management', credits: 3, term: 7, background: 'management', description: '从行业分析到竞争策略，练习在不确定中做判断。' },
    { id: 'professionalEnglish', name: '专业英语文献阅读', subject: 'english', credits: 2, term: 7, background: 'common', description: '精读英文论文，训练摘要和批判性阅读。' },
    { id: 'academicWriting', name: '学术写作', subject: 'general', credits: 2, term: 7, background: 'common', description: '从选题到引用，把研究过程写成规范的文本。' },
    { id: 'researchMethods', name: '研究方法导论', subject: 'general', credits: 2, term: 7, background: 'common', description: '问题、文献、数据与论证，为毕业设计打基础。' },

    { id: 'careerPlanning', name: '职业生涯规划', subject: 'general', credits: 2, term: 8, background: 'common', description: '梳理能力与目标，把毕业选择落到具体行动。' },
    { id: 'innovation', name: '创新创业基础', subject: 'management', credits: 2, term: 8, background: 'common', description: '从问题发现到商业计划，重视团队和可行性。' },
    { id: 'graduationSeminar', name: '毕业专题研讨', subject: 'general', credits: 2, term: 8, background: 'common', description: '围绕毕业设计做汇报和互评，把思路讲清楚。' },
    { id: 'professionalEthics', name: '工程职业伦理', subject: 'engineering', credits: 2, term: 8, background: 'common', description: '用案例讨论工程师的责任、风险和公共安全。' },
    { id: 'graduationCs', name: '毕业设计（信息类）', subject: 'cs', credits: 8, term: 8, background: 'information', description: '把四年学到的知识收束到一个完整作品里。' },
    { id: 'graduationEng', name: '毕业设计（工程类）', subject: 'engineering', credits: 8, term: 8, background: 'engineering', description: '从方案到计算书，完整走一遍工程实践流程。' },
    { id: 'graduationMgmt', name: '毕业设计（经管类）', subject: 'management', credits: 8, term: 8, background: 'management', description: '用数据和理论回答一个真实的管理问题。' }
  ];

  // 参考北京交通大学各学院培养方案的核心课程，按专业补充高年级专业课。
  const MAJOR_COURSES = [
    { id: 'computerArchitecture', name: '计算机体系结构', subject: 'cs', credits: 3, term: 5, background: 'information', major: '计算机科学与技术', description: '指令系统、流水线与存储层次，理解程序性能从哪里来。' },
    { id: 'compiler', name: '编译原理', subject: 'cs', credits: 4, term: 6, background: 'information', major: '计算机科学与技术', description: '词法、语法、语义与代码生成，把高级语言翻译成机器指令。' },
    { id: 'machineLearning', name: '机器学习', subject: 'ai', topic: 'ml', credits: 3, term: 7, background: 'information', major: '计算机科学与技术', description: '监督学习、模型评估与正则化，用数据训练可泛化的模型。' },
    { id: 'graduationComputer', name: '毕业设计（计算机）', subject: 'cs', credits: 8, term: 8, background: 'information', major: '计算机科学与技术', description: '完成一个计算机系统或应用课题，从需求到实现完整交付。' },

    { id: 'communicationPrinciples', name: '通信原理', subject: 'communication', topic: 'signals', credits: 4, term: 5, background: 'information', major: '通信工程', description: '模拟与数字调制、信道编码与噪声分析，通信系统的核心理论。' },
    { id: 'digitalSignalProcessing', name: '数字信号处理', subject: 'communication', topic: 'signals', credits: 3, term: 6, background: 'information', major: '通信工程', description: '采样、Z 变换与数字滤波，把连续信号变成可计算的序列。' },
    { id: 'mobileCommunication', name: '移动通信', subject: 'communication', credits: 3, term: 7, background: 'information', major: '通信工程', description: '蜂窝组网、多址技术与无线信道，理解手机如何保持连接。' },
    { id: 'graduationCommunication', name: '毕业设计（通信）', subject: 'communication', credits: 8, term: 8, background: 'information', major: '通信工程', description: '围绕通信系统、网络或信号处理完成一个完整工程课题。' },

    { id: 'softwareArchitecture', name: '软件体系结构', subject: 'software', credits: 3, term: 5, background: 'information', major: '软件工程', description: '分层、微服务与质量属性，在写代码前先设计系统骨架。' },
    { id: 'softwareTesting', name: '软件测试', subject: 'software', credits: 3, term: 6, background: 'information', major: '软件工程', description: '黑盒与白盒方法、测试用例与缺陷管理，质量要靠证据说话。' },
    { id: 'softwareProjectManagement', name: '软件项目管理', subject: 'software', topic: 'project', credits: 3, term: 7, background: 'information', major: '软件工程', description: '范围、进度、成本与风险管理，让软件项目按计划交付。' },
    { id: 'graduationSoftware', name: '毕业设计（软件）', subject: 'software', credits: 8, term: 8, background: 'information', major: '软件工程', description: '完成一个软件系统，覆盖需求、设计、实现、测试与部署。' },

    { id: 'machineLearningAi', name: '机器学习', subject: 'ai', topic: 'ml', credits: 3, term: 5, background: 'information', major: '人工智能', description: '从线性模型到集成学习，掌握训练与评估的基本方法。' },
    { id: 'deepLearning', name: '深度学习', subject: 'ai', topic: 'ml', credits: 3, term: 6, background: 'information', major: '人工智能', description: '神经网络、反向传播与卷积结构，理解深度模型的训练过程。' },
    { id: 'naturalLanguageProcessing', name: '自然语言处理', subject: 'ai', credits: 3, term: 7, background: 'information', major: '人工智能', description: '文本表示、序列建模与预训练模型，让机器理解和生成语言。' },
    { id: 'graduationAi', name: '毕业设计（人工智能）', subject: 'ai', credits: 8, term: 8, background: 'information', major: '人工智能', description: '围绕智能算法或应用完成数据、模型、实验与论文。' },

    { id: 'soilMechanics', name: '土力学与基础工程', subject: 'civil', topic: 'soil', credits: 4, term: 5, background: 'engineering', major: '土木工程', description: '土的强度、变形与地基承载，先读懂地面以下再谈上部结构。' },
    { id: 'concreteDesign', name: '混凝土结构设计原理', subject: 'civil', credits: 4, term: 6, background: 'engineering', major: '土木工程', description: '受弯、受压与受剪承载力，按规范完成配筋与验算。' },
    { id: 'steelDesign', name: '钢结构设计原理', subject: 'civil', credits: 3, term: 7, background: 'engineering', major: '土木工程', description: '连接、稳定与构件设计，钢材强度高但稳定问题更突出。' },
    { id: 'graduationCivil', name: '毕业设计（土木）', subject: 'civil', credits: 8, term: 8, background: 'engineering', major: '土木工程', description: '完成结构或施工组织设计，从计算书到图纸完整走一遍。' },

    { id: 'transportOrganization', name: '运输组织学', subject: 'transport', topic: 'traffic', credits: 3, term: 5, background: 'engineering', major: '交通运输', description: '客流货流组织、运行图与能力协调，运输系统的日常指挥。' },
    { id: 'railwayOperation', name: '铁路行车组织', subject: 'transport', topic: 'traffic', credits: 4, term: 6, background: 'engineering', major: '交通运输', description: '车站作业、列车运行图与区间能力，铁路运输的核心专业课。' },
    { id: 'transportPlanning', name: '交通规划', subject: 'transport', topic: 'traffic', credits: 3, term: 7, background: 'engineering', major: '交通运输', description: '四阶段法、OD 调查与网络分配，为城市交通提供决策依据。' },
    { id: 'graduationTransport', name: '毕业设计（交通运输）', subject: 'transport', credits: 8, term: 8, background: 'engineering', major: '交通运输', description: '围绕运输组织、规划或运营完成一个真实交通课题。' },

    { id: 'mechanism', name: '机械原理', subject: 'mechanical', topic: 'machine', credits: 4, term: 5, background: 'engineering', major: '机械工程', description: '机构组成、运动分析与力分析，理解机器如何运动。' },
    { id: 'machineDesign', name: '机械设计', subject: 'mechanical', credits: 4, term: 6, background: 'engineering', major: '机械工程', description: '连接、传动与轴系设计，把运动方案落到可制造的零件。' },
    { id: 'manufacturingTechnology', name: '机械制造技术基础', subject: 'mechanical', credits: 3, term: 7, background: 'engineering', major: '机械工程', description: '切削、工艺规程与装配，理解零件从毛坯到成品的路径。' },
    { id: 'graduationMechanical', name: '毕业设计（机械）', subject: 'mechanical', credits: 8, term: 8, background: 'engineering', major: '机械工程', description: '完成机械结构或机电系统设计，兼顾强度、工艺与控制。' },

    { id: 'electricalMachines', name: '电机学', subject: 'electrical', topic: 'power', credits: 4, term: 5, background: 'engineering', major: '电气工程及其自动化', description: '变压器、异步电机与同步电机，电能与机械能转换的核心。' },
    { id: 'powerElectronics', name: '电力电子技术', subject: 'electrical', topic: 'power', credits: 3, term: 6, background: 'engineering', major: '电气工程及其自动化', description: '整流、逆变与斩波电路，用开关器件控制电能形态。' },
    { id: 'powerSystemAnalysis', name: '电力系统分析', subject: 'electrical', topic: 'power', credits: 4, term: 7, background: 'engineering', major: '电气工程及其自动化', description: '潮流、短路与稳定性计算，电网规划运行的基础。' },
    { id: 'graduationElectrical', name: '毕业设计（电气）', subject: 'electrical', credits: 8, term: 8, background: 'engineering', major: '电气工程及其自动化', description: '完成电力系统、电机或电力电子方向的工程设计与分析。' },

    { id: 'intermediateMicroeconomics', name: '中级微观经济学', subject: 'economics', credits: 3, term: 5, background: 'management', major: '经济学', description: '消费者选择、厂商理论与市场结构，用模型解释价格机制。' },
    { id: 'econometrics', name: '计量经济学', subject: 'economics', topic: 'statistics', credits: 3, term: 6, background: 'management', major: '经济学', description: '回归、假设检验与因果识别，用数据检验经济理论。' },
    { id: 'internationalEconomics', name: '国际经济学', subject: 'economics', credits: 3, term: 7, background: 'management', major: '经济学', description: '比较优势、国际贸易与汇率制度，理解开放经济中的选择。' },
    { id: 'graduationEconomics', name: '毕业设计（经济学）', subject: 'economics', credits: 8, term: 8, background: 'management', major: '经济学', description: '围绕现实经济问题完成文献、数据、模型与政策分析。' },

    { id: 'financialMarkets', name: '金融市场与机构', subject: 'finance', credits: 3, term: 5, background: 'management', major: '金融学', description: '银行、证券与保险机构的运行，理解资金如何跨期配置。' },
    { id: 'financialEngineering', name: '金融工程', subject: 'finance', topic: 'finance', credits: 3, term: 6, background: 'management', major: '金融学', description: '衍生品定价、套期保值与无套利思维，金融中的工程方法。' },
    { id: 'financialRiskManagement', name: '金融风险管理', subject: 'finance', credits: 3, term: 7, background: 'management', major: '金融学', description: '市场风险、信用风险与 VaR，识别并度量金融不确定性。' },
    { id: 'graduationFinance', name: '毕业设计（金融）', subject: 'finance', credits: 8, term: 8, background: 'management', major: '金融学', description: '完成金融产品、风险管理或市场分析方向的毕业论文。' },

    { id: 'intermediateAccounting', name: '中级财务会计', subject: 'accounting', credits: 4, term: 5, background: 'management', major: '会计学', description: '资产、负债、收入与财务报表编制，会计专业的核心主干课。' },
    { id: 'costAccounting', name: '成本会计', subject: 'accounting', credits: 3, term: 6, background: 'management', major: '会计学', description: '成本归集、分配与差异分析，为定价和绩效提供依据。' },
    { id: 'auditing', name: '审计学', subject: 'accounting', credits: 3, term: 7, background: 'management', major: '会计学', description: '审计证据、风险导向审计与内部控制，学会验证财务信息。' },
    { id: 'graduationAccounting', name: '毕业设计（会计）', subject: 'accounting', credits: 8, term: 8, background: 'management', major: '会计学', description: '围绕财务报告、审计或成本管理完成一篇应用型论文。' },

    { id: 'organizationalBehavior', name: '组织行为学', subject: 'management', credits: 3, term: 5, background: 'management', major: '工商管理', description: '个体、群体与组织行为，理解制度之外的人的因素。' },
    { id: 'financialManagement', name: '财务管理', subject: 'finance', credits: 3, term: 6, background: 'management', major: '工商管理', description: '筹资、投资、营运资金与股利政策，为企业决策提供财务依据。' },
    { id: 'corporateGovernance', name: '公司治理', subject: 'management', credits: 3, term: 7, background: 'management', major: '工商管理', description: '股权结构、董事会与激励机制，处理所有者与经营者的关系。' },
    { id: 'graduationBusiness', name: '毕业设计（工商管理）', subject: 'management', credits: 8, term: 8, background: 'management', major: '工商管理', description: '围绕企业战略、组织或运营问题完成调研与方案设计。' }
  ];
  COURSES.push(...MAJOR_COURSES);

  const QUESTIONS = {
    math: [
      { id: 'math-1', prompt: '当 x 趋近于 0 时，sin(3x)/x 的极限是？', options: ['0', '1', '3', '不存在'], answer: 2 },
      { id: 'math-2', prompt: '函数 f(x)=x²eˣ 的导数是？', options: ['2xeˣ', 'eˣ(x²+2x)', 'x²eˣ', 'eˣ(x+2)'], answer: 1 },
      { id: 'math-3', prompt: '定积分 ∫[0,1] 2x dx 的值是？', options: ['1', '2', '1/2', '0'], answer: 0 },
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
    english: [
      { id: 'english-1', prompt: '英文单词 “benefit” 最接近的中文意思是？', options: ['损害', '益处', '义务', '证据'], answer: 1 },
      { id: 'english-2', prompt: '选择语法正确的句子。', options: ['She has lived in Beijing since 2020.', 'She have lived in Beijing since 2020.', 'She has live in Beijing since 2020.', 'She lived in Beijing since 2020.'], answer: 0 },
      { id: 'english-3', prompt: '动词 “write” 的过去分词是？', options: ['wrote', 'written', 'writing', 'writed'], answer: 1 },
      { id: 'english-4', prompt: 'If I ___ more time, I would read more.', options: ['have', 'had', 'will have', 'am having'], answer: 1 },
      { id: 'english-5', prompt: '单词 “scarce” 的反义词是？', options: ['rare', 'abundant', 'limited', 'short'], answer: 1 },
      { id: 'english-6', prompt: '与 “significant” 意思最接近的是？', options: ['important', 'tiny', 'ordinary', 'silent'], answer: 0 },
      { id: 'english-7', prompt: '选择正确介词：interested ___ physics.', options: ['in', 'on', 'at', 'for'], answer: 0 },
      { id: 'english-8', prompt: '单词 “analysis” 的复数形式是？', options: ['analysises', 'analyses', 'analysis', 'analysies'], answer: 1 }
    ],
    humanities: [
      { id: 'humanities-1', prompt: '中国近代史通常以哪一事件作为开端？', options: ['甲午战争', '鸦片战争', '辛亥革命', '五四运动'], answer: 1 },
      { id: 'humanities-2', prompt: '五四运动爆发于哪一年？', options: ['1911 年', '1919 年', '1921 年', '1937 年'], answer: 1 },
      { id: 'humanities-3', prompt: '马克思主义诞生的标志是？', options: ['《共产党宣言》发表', '十月革命胜利', '第一国际成立', '巴黎公社建立'], answer: 0 },
      { id: 'humanities-4', prompt: '检验真理的唯一标准是？', options: ['权威', '实践', '多数人意见', '逻辑演绎'], answer: 1 },
      { id: 'humanities-5', prompt: '社会主义核心价值观国家层面的内容是？', options: ['富强、民主、文明、和谐', '自由、平等、公正、法治', '爱国、敬业、诚信、友善', '勤俭、节约、奋斗、创新'], answer: 0 },
      { id: 'humanities-6', prompt: '中国共产党的根本宗旨是？', options: ['发展经济', '全心全意为人民服务', '维护世界和平', '推动科技创新'], answer: 1 },
      { id: 'humanities-7', prompt: '关于量变与质变，下列说法正确的是？', options: ['量变是质变的必要准备', '质变与量变无关', '量变一定立刻引起质变', '质变后不再发生量变'], answer: 0 },
      { id: 'humanities-8', prompt: '人民群众在历史发展中的作用是？', options: ['历史的创造者', '历史的旁观者', '历史的阻碍者', '只受历史支配'], answer: 0 }
    ],
    law: [
      { id: 'law-1', prompt: '合同订立一般要经过哪两个阶段？', options: ['要约和承诺', '协商和公证', '登记和备案', '付款和交付'], answer: 0 },
      { id: 'law-2', prompt: '有限责任公司股东通常以什么为限承担责任？', options: ['全部个人财产', '认缴出资额', '公司全部债务', '家庭财产'], answer: 1 },
      { id: 'law-3', prompt: '普通民事诉讼时效期间一般为？', options: ['1 年', '2 年', '3 年', '5 年'], answer: 2 },
      { id: 'law-4', prompt: '劳动合同试用期最长不得超过？', options: ['3 个月', '6 个月', '1 年', '2 年'], answer: 1 },
      { id: 'law-5', prompt: '定金数额不得超过主合同标的额的？', options: ['10%', '20%', '30%', '50%'], answer: 1 },
      { id: 'law-6', prompt: '经营者采用网络等方式销售商品，消费者通常享有多久无理由退货期？', options: ['3 日', '7 日', '15 日', '30 日'], answer: 1 },
      { id: 'law-7', prompt: '发明专利权的保护期限一般为？', options: ['10 年', '15 年', '20 年', '50 年'], answer: 2 },
      { id: 'law-8', prompt: '发生劳动争议时，一般应先经过什么程序？', options: ['劳动仲裁', '直接起诉', '刑事立案', '行政复议'], answer: 0 }
    ],
    sports: [
      { id: 'sports-1', prompt: '正式篮球比赛中，每队场上球员人数是？', options: ['5 人', '6 人', '7 人', '11 人'], answer: 0 },
      { id: 'sports-2', prompt: '正式足球比赛中，每队场上球员人数是？', options: ['5 人', '7 人', '11 人', '15 人'], answer: 2 },
      { id: 'sports-3', prompt: '标准马拉松比赛的距离是？', options: ['21.0975 km', '42.195 km', '50 km', '100 km'], answer: 1 },
      { id: 'sports-4', prompt: '标准田径场最内圈一圈的长度通常是？', options: ['200 m', '300 m', '400 m', '800 m'], answer: 2 },
      { id: 'sports-5', prompt: '正式排球比赛中，每队场上球员人数是？', options: ['5 人', '6 人', '7 人', '9 人'], answer: 1 },
      { id: 'sports-6', prompt: '剧烈运动前进行热身的主要目的是？', options: ['增加体重', '降低体温', '减少受伤风险', '提高考试成绩'], answer: 2 },
      { id: 'sports-7', prompt: '有氧运动通常具有什么特点？', options: ['中低强度、持续时间较长', '短时间爆发', '完全不需要呼吸', '只锻炼上肢'], answer: 0 },
      { id: 'sports-8', prompt: '成年人正常静息心率通常为每分钟？', options: ['20～40 次', '60～100 次', '120～160 次', '180 次以上'], answer: 1 }
    ],
    general: [
      { id: 'general-1', prompt: '论文中引用他人观点时，最重要的学术规范是？', options: ['改写后不必标注', '注明出处', '只引用中文文献', '删掉作者姓名'], answer: 1 },
      { id: 'general-2', prompt: '文献综述的主要作用是？', options: ['堆砌参考文献', '梳理已有研究并说明研究缺口', '代替实验数据', '证明作者阅读量'], answer: 1 },
      { id: 'general-3', prompt: '随机抽样的主要目的是？', options: ['提高样本代表性', '保证结果一定显著', '减少样本数量', '避免使用统计方法'], answer: 0 },
      { id: 'general-4', prompt: '关于相关与因果，下列说法正确的是？', options: ['相关一定意味着因果', '有因果就一定没有相关', '相关不一定意味着因果', '两者完全无关'], answer: 2 },
      { id: 'general-5', prompt: '毕业论文摘要通常应概括？', options: ['研究目的、方法、结果和结论', '所有参考文献', '致谢名单', '实验原始数据'], answer: 0 },
      { id: 'general-6', prompt: '职业生涯规划的第一步通常是？', options: ['直接投递简历', '认识自我并了解外部环境', '比较薪资高低', '等待机会出现'], answer: 1 },
      { id: 'general-7', prompt: '创新创业中最小可行产品（MVP）的主要目的是？', options: ['一次性完成全部功能', '快速验证核心假设', '降低产品质量', '避免用户反馈'], answer: 1 },
      { id: 'general-8', prompt: '北京交通大学的前身是？', options: ['京师大学堂', '铁路管理传习所', '南洋公学', '清华学堂'], answer: 1 }
    ],
    transport: [
      { id: 'transport-1', prompt: '交通流三参数关系为 Q=K×V。某路段密度 40 辆/km、平均速度 30 km/h，流量约为？', options: ['700 辆/h', '1200 辆/h', '1600 辆/h', '2400 辆/h'], answer: 1 },
      { id: 'transport-2', prompt: '一条车道基本通行能力为 1800 pcu/h，2 条车道综合折减系数取 0.9，设计通行能力约为？', options: ['1800 pcu/h', '3240 pcu/h', '3600 pcu/h', '4000 pcu/h'], answer: 1 },
      { id: 'transport-3', prompt: '铁路区间追踪列车间隔时间为 8 分钟，按 1440 分钟计算，区间通过能力约为？', options: ['90 列/日', '120 列/日', '180 列/日', '240 列/日'], answer: 2 },
      { id: 'transport-4', prompt: '交通规划四阶段法中，紧接“出行生成”之后的步骤是？', options: ['交通分布', '方式划分', '交通分配', '网络设计'], answer: 0 },
      { id: 'transport-5', prompt: 'M/M/1 排队系统中，到达率 6 人/h、服务率 10 人/h，服务台利用率是？', options: ['0.4', '0.6', '1.6', '4.0'], answer: 1 },
      { id: 'transport-6', prompt: '交通规划中的 OD 矩阵主要描述？', options: ['道路几何线形', '起讫点之间的出行量', '车辆排放水平', '公交票价结构'], answer: 1 }
    ],
    civil: [
      { id: 'civil-1', prompt: '某点总应力为 200 kPa，孔隙水压力为 80 kPa，有效应力是？', options: ['80 kPa', '120 kPa', '200 kPa', '280 kPa'], answer: 1 },
      { id: 'civil-2', prompt: '土体中孔隙体积为 0.3 m³、固体颗粒体积为 0.6 m³，孔隙比 e 是？', options: ['0.3', '0.5', '1.5', '2.0'], answer: 1 },
      { id: 'civil-3', prompt: '钢筋混凝土保护层最主要的作用是？', options: ['提高混凝土强度', '保护钢筋并保证耐久性', '减少模板用量', '代替箍筋'], answer: 1 },
      { id: 'civil-4', prompt: '结构可靠指标 β 增大时，结构的失效概率通常？', options: ['增大', '减小', '不变', '先增后减'], answer: 1 },
      { id: 'civil-5', prompt: '土的三相组成中，构成土骨架的是？', options: ['固相颗粒', '孔隙水', '孔隙气', '毛细水'], answer: 0 },
      { id: 'civil-6', prompt: '梁在纯弯曲时，横截面中性轴处的正应力为？', options: ['最大值', '零', '拉应力', '压应力'], answer: 1 }
    ],
    mechanical: [
      { id: 'mechanical-1', prompt: '一对齿轮齿数分别为 20 和 60，传动比 i 是？', options: ['1/3', '2', '3', '6'], answer: 2 },
      { id: 'mechanical-2', prompt: '某机械输入功率 1000 W、输出功率 800 W，机械效率是？', options: ['20%', '80%', '125%', '800%'], answer: 1 },
      { id: 'mechanical-3', prompt: '铰链四杆机构中，曲柄存在的条件之一是？', options: ['曲柄为最长杆', '曲柄为最短杆且满足杆长条件', '连杆为最短杆', '机架为最短杆'], answer: 1 },
      { id: 'mechanical-4', prompt: '45 钢调质处理的主要目的是？', options: ['提高综合力学性能', '降低硬度至零', '消除所有合金元素', '提高导电性'], answer: 0 },
      { id: 'mechanical-5', prompt: '带传动相对齿轮传动的一个典型优点是？', options: ['传动比绝对准确', '过载时可打滑起保护作用', '不需要张紧', '适合高温高速重载'], answer: 1 },
      { id: 'mechanical-6', prompt: '螺栓连接中施加预紧力的主要作用是？', options: ['增大螺栓直径', '防止连接松动并提高刚度', '减小被连接件厚度', '改变螺纹旋向'], answer: 1 }
    ],
    electrical: [
      { id: 'electrical-1', prompt: '三相对称负载线电压 380 V、线电流 10 A、功率因数 0.8，有功功率约为？', options: ['3.04 kW', '5.26 kW', '6.58 kW', '10.0 kW'], answer: 1 },
      { id: 'electrical-2', prompt: '变压器一次侧 10000 V、二次侧 400 V，变比约为？', options: ['0.04', '4', '25', '400'], answer: 2 },
      { id: 'electrical-3', prompt: '50 Hz 电源供电、极对数为 2 的同步电机，同步转速是？', options: ['750 r/min', '1000 r/min', '1500 r/min', '3000 r/min'], answer: 2 },
      { id: 'electrical-4', prompt: '提高工业负载功率因数的主要好处是？', options: ['增大线路电流', '减少线路损耗并释放容量', '提高频率', '降低电压等级'], answer: 1 },
      { id: 'electrical-5', prompt: '继电保护的“选择性”是指？', options: ['只保护最重要设备', '只切除故障设备并缩小停电范围', '动作越快越好', '只在白天动作'], answer: 1 },
      { id: 'electrical-6', prompt: '电力系统一次调频主要依靠？', options: ['发电机调速器', '手动拉闸', '更换变压器', '增加电缆截面'], answer: 0 }
    ],
    communication: [
      { id: 'communication-1', prompt: '某模拟信号最高频率为 4 kHz，按奈奎斯特采样定理，最低采样频率是？', options: ['2 kHz', '4 kHz', '8 kHz', '16 kHz'], answer: 2 },
      { id: 'communication-2', prompt: '信道带宽 3 kHz、信噪比 7，按香农公式，信道容量约为？', options: ['3 kb/s', '6 kb/s', '9 kb/s', '21 kb/s'], answer: 2 },
      { id: 'communication-3', prompt: '频率为 300 MHz 的电磁波，在自由空间中的波长约为？', options: ['0.1 m', '1 m', '3 m', '300 m'], answer: 1 },
      { id: 'communication-4', prompt: '数字通信中误码率的定义是？', options: ['错误比特数除以总比特数', '信号功率除以噪声功率', '带宽除以符号率', '发送功率除以接收功率'], answer: 0 },
      { id: 'communication-5', prompt: '调制在通信系统中的主要作用是？', options: ['消除所有噪声', '把信号频谱搬移到适合信道传输的位置', '提高电源电压', '压缩数据文件'], answer: 1 },
      { id: 'communication-6', prompt: '8PSK 调制中，每个符号携带的信息量为？', options: ['1 bit', '2 bit', '3 bit', '8 bit'], answer: 2 }
    ],
    software: [
      { id: 'software-1', prompt: '软件设计中通常追求的质量目标是？', options: ['高耦合、低内聚', '高内聚、低耦合', '高耦合、高内聚', '低耦合、低内聚'], answer: 1 },
      { id: 'software-2', prompt: '黑盒测试主要依据什么设计测试用例？', options: ['程序内部语句', '需求规格说明', '编译器版本', '数据库索引'], answer: 1 },
      { id: 'software-3', prompt: '敏捷开发中的 Sprint 通常指？', options: ['一个固定时长的迭代周期', '一次数据库备份', '一种编程语言', '最终用户手册'], answer: 0 },
      { id: 'software-4', prompt: 'Git 中把暂存区修改记录到本地仓库的命令是？', options: ['git push', 'git commit', 'git clone', 'git status'], answer: 1 },
      { id: 'software-5', prompt: '软件需求规格说明书（SRS）主要描述？', options: ['服务器采购清单', '系统应满足的功能与非功能需求', '源代码注释规范', '员工排班表'], answer: 1 },
      { id: 'software-6', prompt: '软件生命周期中，详细设计通常紧接在哪个阶段之后？', options: ['需求分析', '系统测试', '运行维护', '项目验收'], answer: 0 }
    ],
    economics: [
      { id: 'economics-1', prompt: '选择读研而放弃的直接工作收入，属于？', options: ['沉没成本', '机会成本', '固定成本', '会计成本'], answer: 1 },
      { id: 'economics-2', prompt: '按支出法核算 GDP，通常包括？', options: ['消费、投资、政府购买和净出口', '工资、租金和利润', '进口、出口和关税', '储蓄、投资和税收'], answer: 0 },
      { id: 'economics-3', prompt: '需求价格弹性绝对值大于 1 时，该商品需求属于？', options: ['缺乏弹性', '单位弹性', '富有弹性', '完全无弹性'], answer: 2 },
      { id: 'economics-4', prompt: '居民消费价格指数（CPI）主要用于衡量？', options: ['股票价格变化', '居民消费商品和服务的价格变化', '工业增加值', '财政赤字规模'], answer: 1 },
      { id: 'economics-5', prompt: '边际效用递减规律是指？', options: ['消费越多总效用越低', '连续增加消费时新增效用逐渐减少', '价格越高需求越大', '收入越高储蓄越少'], answer: 1 },
      { id: 'economics-6', prompt: '比较优势理论认为，各国应专业化生产？', options: ['绝对成本最低的产品', '机会成本较低的产品', '价格最高的产品', '进口最多的产品'], answer: 1 }
    ],
    finance: [
      { id: 'finance-1', prompt: '年利率 10%，2 年后收到 1210 元，其现值约为？', options: ['1000 元', '1100 元', '1200 元', '1210 元'], answer: 0 },
      { id: 'finance-2', prompt: '市场利率上升时，固定利率债券价格通常？', options: ['上升', '下降', '不变', '先降后升'], answer: 1 },
      { id: 'finance-3', prompt: '无风险利率 3%、市场风险溢价 8%、β=1.2，按 CAPM 预期收益率为？', options: ['9.6%', '12.6%', '13.0%', '14.4%'], answer: 1 },
      { id: 'finance-4', prompt: '夏普比率的计算公式是？', options: ['(组合收益-无风险利率)/组合标准差', '组合收益/无风险利率', '无风险利率/组合方差', '组合标准差/组合收益'], answer: 0 },
      { id: 'finance-5', prompt: '通过分散投资主要可以降低？', options: ['系统性风险', '非系统性风险', '通货膨胀', '无风险利率'], answer: 1 },
      { id: 'finance-6', prompt: '半强式有效市场假说认为，资产价格反映了？', options: ['只有历史价格', '所有公开信息', '只有内幕信息', '所有未来信息'], answer: 1 }
    ],
    accounting: [
      { id: 'accounting-1', prompt: '借贷记账法的基本记账规则是？', options: ['有借必有贷，借贷必相等', '只记借方不记贷方', '借贷金额可以不等', '资产增加记贷方'], answer: 0 },
      { id: 'accounting-2', prompt: '会计基本等式是？', options: ['资产=负债+所有者权益', '资产=收入+费用', '利润=资产+负债', '负债=资产+权益'], answer: 0 },
      { id: 'accounting-3', prompt: '权责发生制要求收入和费用按什么确认？', options: ['现金收付时点', '权利和责任发生期间', '年末统一确认', '合同签订时点'], answer: 1 },
      { id: 'accounting-4', prompt: '设备原值 100000 元、预计净残值 5000 元、使用 5 年，直线法年折旧额为？', options: ['18000 元', '19000 元', '20000 元', '21000 元'], answer: 1 },
      { id: 'accounting-5', prompt: '利润表中，利润通常等于？', options: ['收入减费用', '资产减负债', '现金流入减流出', '负债加所有者权益'], answer: 0 },
      { id: 'accounting-6', prompt: '先进先出法在物价上涨时，通常使期末存货价值？', options: ['偏低', '偏高', '为零', '与后进先出法相同'], answer: 1 }
    ],
    chemistry: [
      { id: 'chemistry-1', prompt: '水的摩尔质量约为？', options: ['16 g/mol', '18 g/mol', '20 g/mol', '36 g/mol'], answer: 1 },
      { id: 'chemistry-2', prompt: '0.01 mol/L 盐酸溶液的 pH 约为？', options: ['1', '2', '7', '12'], answer: 1 },
      { id: 'chemistry-3', prompt: '氧化还原反应的本质是？', options: ['电子转移', '质子转移', '分子扩散', '热量传递'], answer: 0 },
      { id: 'chemistry-4', prompt: '勒夏特列原理用于判断？', options: ['反应速率常数', '外界条件改变时化学平衡的移动方向', '分子量大小', '溶液颜色'], answer: 1 },
      { id: 'chemistry-5', prompt: '理想气体状态方程是？', options: ['PV=nRT', 'P=VnRT', 'PV=n/RT', 'P+n=VRT'], answer: 0 },
      { id: 'chemistry-6', prompt: '共价键形成的主要原因是？', options: ['原子间共享电子', '原子间完全转移质子', '原子核融合', '分子间氢键断裂'], answer: 0 }
    ],
    ai: [
      { id: 'ai-1', prompt: '监督学习与无监督学习的主要区别是？', options: ['是否使用标注数据', '是否使用计算机', '是否需要数学', '是否处理图像'], answer: 0 },
      { id: 'ai-2', prompt: '某分类器 TP=40、FP=10，精确率是？', options: ['20%', '80%', '90%', '100%'], answer: 1 },
      { id: 'ai-3', prompt: '某分类器 TP=40、FN=10，召回率是？', options: ['20%', '80%', '90%', '100%'], answer: 1 },
      { id: 'ai-4', prompt: '模型训练误差很低但验证误差很高，通常说明？', options: ['欠拟合', '过拟合', '数据泄漏已消除', '模型没有参数'], answer: 1 },
      { id: 'ai-5', prompt: '梯度下降法更新参数时，通常沿梯度的？', options: ['正方向', '负方向', '垂直方向', '随机方向'], answer: 1 },
      { id: 'ai-6', prompt: '交叉验证的主要作用是？', options: ['增加训练数据量', '更稳定地评估模型泛化能力', '消除所有偏差', '加快推理速度'], answer: 1 }
    ]
  };

  // 旧版考试只会从题库抽题且不改动选项顺序；保留旧通识题库用于校验已有 examPending 存档。
  const LEGACY_QUESTIONS = {
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

  const gcd = (a, b) => {
    let x = Math.abs(a), y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x || 1;
  };
  const fraction = (numerator, denominator) => {
    const divisor = gcd(numerator, denominator);
    const n = numerator / divisor, d = denominator / divisor;
    return d === 1 ? String(n) : n + '/' + d;
  };
  const fixed = (value, digits = 2) => {
    const factor = 10 ** digits;
    return String(Math.round(value * factor) / factor);
  };
  const int = (next, min, max) => min + Math.floor(next() * (max - min + 1));
  const choose = (next, values) => values[Math.min(values.length - 1, Math.floor(next() * values.length))];
  const diceWays = (sum) => {
    let count = 0;
    for (let first = 1; first <= 6; first++) {
      const second = sum - first;
      if (second >= 1 && second <= 6) count++;
    }
    return count;
  };
  const shuffle = (options, next) => {
    for (let index = options.length - 1; index > 0; index--) {
      const swap = Math.min(index, Math.floor(next() * (index + 1)));
      [options[index], options[swap]] = [options[swap], options[index]];
    }
    return options;
  };
  function makeChoice(prompt, correct, distractors, next) {
    const answer = String(correct);
    const options = [answer];
    for (const candidate of distractors) {
      const text = String(candidate);
      if (!options.includes(text)) options.push(text);
      if (options.length === 4) break;
    }
    if (options.length < 4) {
      const fractionMatch = answer.match(/^(-?\d+)\/(\d+)$/);
      const numericMatch = answer.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
      if (fractionMatch) {
        let delta = 1;
        while (options.length < 4) {
          const text = fraction(Number(fractionMatch[1]) + delta, Number(fractionMatch[2]));
          if (!options.includes(text)) options.push(text);
          delta = delta > 0 ? -delta : -delta + 1;
        }
      } else if (numericMatch) {
        const base = Number(numericMatch[1]), suffix = numericMatch[2];
        let delta = 1;
        while (options.length < 4) {
          const text = fixed(base + delta, 2) + suffix;
          if (!options.includes(text)) options.push(text);
          delta = delta > 0 ? -delta : -delta + 1;
        }
      } else {
        for (const fallback of ['以上都不对', '条件不足', '无法确定']) {
          if (!options.includes(fallback)) options.push(fallback);
          if (options.length === 4) break;
        }
      }
    }
    shuffle(options, next);
    return { prompt, options, answer: options.indexOf(answer) };
  }
  function fromBank(question, next) {
    const correct = question.options[question.answer];
    return makeChoice(question.prompt, correct, question.options.filter((_, index) => index !== question.answer), next);
  }

  const TOPICS = {
    calculus: [
      (next) => {
        const k = int(next, 2, 9);
        return { prompt: '当 x→0 时，sin(' + k + 'x)/x 的极限是？', correct: String(k), distractors: ['0', '1', String(k * k)] };
      },
      (next) => {
        const k = int(next, 2, 5);
        return { prompt: '函数 f(x)=x²e^(' + k + 'x) 的导数是？', correct: 'e^(' + k + 'x)(2x+' + k + 'x²)', distractors: ['2xe^(' + k + 'x)', 'e^(' + k + 'x)(x²+' + k + ')', k + 'x²e^(' + k + 'x)'] };
      },
      (next) => {
        const k = int(next, 2, 8), a = int(next, 2, 6);
        return { prompt: '定积分 ∫[0,' + a + '] ' + k + 'x dx 的值是？', correct: fixed(k * a * a / 2, 1), distractors: [fixed(k * a, 1), fixed(k * a * a, 1), fixed(k * a * a / 4, 1)] };
      },
      (next) => {
        const a = int(next, 1, 9);
        return { prompt: '函数 ln(x²+' + a + ') 的导数是？', correct: '2x/(x²+' + a + ')', distractors: ['1/(x²+' + a + ')', '2x', 'x/(x²+' + a + ')'] };
      },
      (next) => {
        const a = int(next, 2, 6), b = int(next, 1, 5), c = int(next, 1, 5), d = int(next, 2, 6);
        const det = a * d - b * c;
        return { prompt: '矩阵 [[' + a + ',' + b + '],[' + c + ',' + d + ']] 的行列式是？', correct: String(det), distractors: [String(a * d + b * c), String(b * c - a * d), String(a * c - b * d)] };
      },
      (next) => {
        const a = int(next, 2, 5), n = int(next, 2, 3);
        return { prompt: '函数 f(x)=' + a + 'x^' + n + ' 的导数是？', correct: a * n + 'x^' + (n - 1), distractors: [a + 'x^' + (n - 1), a * n + 'x^' + n, a * n + 'x^' + (n + 1)] };
      }
    ],
    linear: [
      (next) => {
        let a, b, c, d, det;
        do {
          a = int(next, 1, 5); b = int(next, 1, 5); c = int(next, 1, 5); d = int(next, 1, 5);
          det = a * d - b * c;
        } while (det === 0);
        const x = int(next, 1, 5), y = int(next, 1, 5);
        return { prompt: '已知方程组 ' + a + 'x + ' + b + 'y = ' + (a * x + b * y) + '，' + c + 'x + ' + d + 'y = ' + (c * x + d * y) + '，求 x。', correct: String(x), distractors: [String(y), String(x + 1), String(x - 1)] };
      },
      (next) => {
        const a = int(next, 1, 6), b = int(next, 1, 6), c = int(next, 1, 6), d = int(next, 1, 6);
        return { prompt: '向量 (' + a + ', ' + b + ') 与 (' + c + ', ' + d + ') 的点积是？', correct: String(a * c + b * d), distractors: [String(a * d + b * c), String(a * c - b * d), String(a + b + c + d)] };
      },
      (next) => {
        const a = int(next, 2, 7), b = int(next, 1, 6), c = int(next, 1, 6), d = int(next, 2, 7);
        const det = a * d - b * c;
        return { prompt: '矩阵 [[' + a + ',' + b + '],[' + c + ',' + d + ']] 的行列式是？', correct: String(det), distractors: [String(a * d + b * c), String(b * c - a * d), String(a * c + b * d)] };
      }
    ],
    probability: [
      (next) => {
        const sum = int(next, 2, 12), ways = diceWays(sum);
        return { prompt: '同时掷两枚公平骰子，点数之和为 ' + sum + ' 的概率是？', correct: fraction(ways, 36), distractors: [fraction(ways + 1, 36), fraction(ways - 1, 36), fraction(1, 6)] };
      },
      (next) => {
        const red = int(next, 2, 9), blue = int(next, 2, 9);
        return { prompt: '袋中有 ' + red + ' 个红球和 ' + blue + ' 个蓝球，随机取 1 个，取到红球的概率是？', correct: fraction(red, red + blue), distractors: [fraction(blue, red + blue), fraction(red, red + blue + 1), fraction(red + 1, red + blue)] };
      },
      (next) => {
        const a = int(next, 2, 8), b = int(next, 2, 8);
        return { prompt: '事件 A、B 相互独立，P(A)=' + a + '/10，P(B)=' + b + '/10，P(A 且 B)=？', correct: fraction(a * b, 100), distractors: [fraction(a + b, 10), fraction(a * b, 10), fraction(a + b, 100)] };
      },
      (next) => {
        const values = Array.from({ length: 4 }, () => int(next, 1, 10));
        const sum = values.reduce((total, value) => total + value, 0);
        return { prompt: '数据 ' + values.join('、') + ' 的平均数是？', correct: fixed(sum / 4, 2), distractors: [fixed(sum, 2), fixed(sum / 3, 2), fixed(sum / 5, 2)] };
      }
    ],
    statistics: [
      (next) => {
        const values = Array.from({ length: 5 }, () => int(next, 1, 20)).sort((a, b) => a - b);
        return { prompt: '数据 ' + values.join('、') + ' 的中位数是？', correct: String(values[2]), distractors: [String(values[0]), String(values[4]), fixed(values.reduce((sum, value) => sum + value, 0) / 5, 2)] };
      },
      (next) => {
        const values = Array.from({ length: 4 }, () => int(next, 1, 10));
        const mean = values.reduce((sum, value) => sum + value, 0) / 4;
        const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 4;
        return { prompt: '数据 ' + values.join('、') + ' 的总体方差是？', correct: fixed(variance, 2), distractors: [fixed(variance * 2, 2), fixed(mean, 2), fixed(Math.max(...values) - Math.min(...values), 2)] };
      },
      (next) => {
        const values = Array.from({ length: 5 }, () => int(next, 1, 20));
        return { prompt: '数据 ' + values.join('、') + ' 的极差是？', correct: String(Math.max(...values) - Math.min(...values)), distractors: [String(Math.max(...values) + Math.min(...values)), String(Math.max(...values)), String(Math.min(...values))] };
      }
    ],
    numerical: [
      (next) => {
        const exact = int(next, 10, 90), error = int(next, 1, 3);
        const approx = exact + (next() < 0.5 ? -error : error);
        return { prompt: '某量的精确值为 ' + exact + '，近似值为 ' + approx + '，绝对误差是？', correct: String(Math.abs(approx - exact)), distractors: [String(Math.abs(approx - exact) + 1), String(Math.abs(approx - exact) + 2), String(exact)] };
      },
      (next) => {
        const exact = int(next, 50, 200), error = int(next, 1, 10);
        return { prompt: '精确值 ' + exact + '，绝对误差 ' + error + '，相对误差约为？', correct: fixed(error / exact * 100, 2) + '%', distractors: [fixed(error / exact * 1000, 2) + '%', fixed(error / exact, 2) + '%', fixed(exact / error, 2) + '%'] };
      },
      (next) => {
        const base = int(next, 1, 5), values = [base, base + int(next, 1, 3), base + int(next, 4, 8)];
        return { prompt: '近似值 ' + values.join('、') + ' 的极差是？', correct: String(Math.max(...values) - Math.min(...values)), distractors: [String(Math.max(...values) + Math.min(...values)), String(Math.max(...values)), String(Math.min(...values))] };
      }
    ],
    optimization: [
      (next) => {
        const a = int(next, 2, 9), b = int(next, 1, 8), c = int(next, 5, 12);
        return { prompt: '在约束 x≥0、y≥0、x+y≤' + c + ' 下，最大化 z=' + a + 'x+' + b + 'y，最大值是？', correct: String(Math.max(a, b) * c), distractors: [String((a + b) * c), String(Math.min(a, b) * c), String(a * b * c)] };
      },
      (next) => {
        const a = int(next, 2, 9), b = int(next, 1, 8), c = int(next, 5, 12);
        return { prompt: '在约束 x≥0、y≥0、x+y≥' + c + ' 下，最小化 z=' + a + 'x+' + b + 'y，最小值是？', correct: String(Math.min(a, b) * c), distractors: [String(Math.max(a, b) * c), String((a + b) * c), String(a * b * c)] };
      }
    ],
    mechanics: [
      (next) => {
        const mass = int(next, 2, 12), acceleration = int(next, 1, 6);
        return { prompt: '质量为 ' + mass + ' kg 的物体受到 ' + (mass * acceleration) + ' N 的合力，加速度是？', correct: acceleration + ' m/s²', distractors: [mass + acceleration + ' m/s²', mass * acceleration + ' m/s²', mass + ' m/s²'] };
      },
      (next) => {
        const time = int(next, 1, 5);
        return { prompt: '忽略空气阻力，物体从静止自由下落 ' + time + ' s 的位移约为（g 取 10 m/s²）？', correct: 5 * time * time + ' m', distractors: [10 * time + ' m', 5 * time + ' m', 10 * time * time + ' m'] };
      },
      (next) => {
        const mass = int(next, 2, 10), speed = int(next, 2, 8);
        return { prompt: '质量为 ' + mass + ' kg、速度为 ' + speed + ' m/s 的物体，动能是？', correct: fixed(0.5 * mass * speed * speed, 1) + ' J', distractors: [mass * speed + ' J', mass * speed * speed + ' J', fixed(0.5 * mass * speed, 1) + ' J'] };
      },
      (next) => {
        const force = int(next, 2, 10), distance = int(next, 2, 8), angle = choose(next, [0, 60]);
        const work = angle === 0 ? force * distance : force * distance / 2;
        const distractors = angle === 0 ? [fixed(work / 2, 1) + ' J', '0 J', fixed(force * distance * 0.866, 1) + ' J'] : [force * distance + ' J', '0 J', fixed(force * distance * 0.866, 1) + ' J'];
        return { prompt: '恒力 ' + force + ' N 作用在物体上，位移 ' + distance + ' m，夹角 ' + angle + '°，做功为？', correct: fixed(work, 1) + ' J', distractors };
      },
      (next) => {
        const mass = int(next, 2, 10), speed = int(next, 2, 8);
        return { prompt: '质量为 ' + mass + ' kg、速度为 ' + speed + ' m/s 的物体，动量大小是？', correct: mass * speed + ' kg·m/s', distractors: [mass + ' kg·m/s', speed + ' kg·m/s', fixed(0.5 * mass * speed * speed, 1) + ' kg·m/s'] };
      },
      (next) => {
        const work = int(next, 50, 200), time = int(next, 2, 8);
        return { prompt: '物体在 ' + time + ' s 内做功 ' + work + ' J，平均功率是？', correct: fixed(work / time, 2) + ' W', distractors: [work * time + ' W', fixed(time / work, 2) + ' W', fixed(work / (time * 2), 2) + ' W'] };
      }
    ],
    circuits: [
      (next) => {
        const current = int(next, 1, 5), resistance = int(next, 2, 10);
        return { prompt: '电阻 ' + resistance + ' Ω 中通过 ' + current + ' A 电流，两端电压是？', correct: current * resistance + ' V', distractors: [fixed(current / resistance, 2) + ' V', fixed(resistance / current, 2) + ' V', current + resistance + ' V'] };
      },
      (next) => {
        const r1 = choose(next, [10, 20, 30, 40]), r2 = choose(next, [10, 20, 30, 40]);
        return { prompt: '电阻 ' + r1 + ' Ω 与 ' + r2 + ' Ω 并联，等效电阻是？', correct: fixed(r1 * r2 / (r1 + r2), 2) + ' Ω', distractors: [r1 + r2 + ' Ω', r1 * r2 + ' Ω', Math.abs(r1 - r2) + ' Ω'] };
      },
      (next) => {
        const voltage = int(next, 2, 12), current = int(next, 1, 5);
        return { prompt: '用电器两端电压 ' + voltage + ' V，电流 ' + current + ' A，电功率是？', correct: voltage * current + ' W', distractors: [voltage + current + ' W', fixed(voltage / current, 2) + ' W', fixed(current / voltage, 2) + ' W'] };
      },
      (next) => {
        const frequency = int(next, 2, 10), wavelength = int(next, 1, 5);
        return { prompt: '波的频率为 ' + frequency + ' Hz、波长为 ' + wavelength + ' m，波速是？', correct: frequency * wavelength + ' m/s', distractors: [frequency + wavelength + ' m/s', fixed(frequency / wavelength, 2) + ' m/s', fixed(wavelength / frequency, 2) + ' m/s'] };
      }
    ],
    measurement: [
      (next) => {
        const base = int(next, 10, 50), values = [base, base + int(next, -3, 3), base + int(next, -3, 3)];
        const sum = values.reduce((total, value) => total + value, 0);
        return { prompt: '三次测量值为 ' + values.join('、') + '，平均值是？', correct: fixed(sum / 3, 2), distractors: [fixed(sum, 2), fixed(sum / 2, 2), fixed(sum / 4, 2)] };
      },
      (next) => {
        const truth = int(next, 20, 80), measured = truth + int(next, -5, 5) || truth + 1;
        return { prompt: '真实值 ' + truth + '，测量值 ' + measured + '，绝对误差是？', correct: String(Math.abs(measured - truth)), distractors: [String(Math.abs(measured - truth) + 1), String(Math.abs(measured - truth) + 2), String(truth)] };
      },
      (next) => {
        const values = [int(next, 5, 30), int(next, 5, 30), int(next, 5, 30)];
        return { prompt: '测量数据 ' + values.join('、') + ' 的极差是？', correct: String(Math.max(...values) - Math.min(...values)), distractors: [String(Math.max(...values) + Math.min(...values)), String(Math.max(...values)), String(Math.min(...values))] };
      }
    ],
    binary: [
      (next) => {
        const length = int(next, 4, 6);
        let bits = '1';
        for (let index = 1; index < length; index++) bits += String(int(next, 0, 1));
        const decimal = parseInt(bits, 2), reversed = parseInt([...bits].reverse().join(''), 2);
        return { prompt: '二进制数 ' + bits + ' 对应的十进制数是？', correct: String(decimal), distractors: [String(decimal + 1), String(decimal - 1), String(reversed)] };
      },
      (next) => {
        const decimal = int(next, 8, 63);
        return { prompt: '十进制数 ' + decimal + ' 对应的二进制数是？', correct: decimal.toString(2), distractors: [(decimal + 1).toString(2), (decimal - 1).toString(2), (decimal * 2).toString(2)] };
      }
    ],
    complexity: [
      (next) => {
        const power = int(next, 3, 10), count = 2 ** power;
        return { prompt: '对 ' + count + ' 个有序元素做二分查找，最坏情况下大约需要比较多少次？', correct: String(power + 1), distractors: [String(power), String(power + 2), String(count / 2)] };
      },
      (next) => {
        const layers = int(next, 2, 6);
        return { prompt: '一棵层数为 ' + layers + ' 的满二叉树，最多有多少个结点？', correct: String(2 ** layers - 1), distractors: [String(2 ** (layers - 1) - 1), String(2 ** layers), String(2 ** (layers + 1) - 1)] };
      },
      (next) => {
        const power = int(next, 3, 9), count = 2 ** power;
        return { prompt: '对 ' + count + ' 个元素做归并排序，递归分解的层数是？', correct: String(power), distractors: [String(power + 1), String(power - 1), String(count)] };
      },
      (next) => {
        const buckets = choose(next, [10, 20, 25, 50]), count = buckets * int(next, 2, 5);
        return { prompt: '哈希表有 ' + buckets + ' 个桶，装入 ' + count + ' 个元素，装载因子是？', correct: String(count / buckets), distractors: [String(buckets / count), String(count - buckets), String(count * buckets)] };
      }
    ],
    stress: [
      (next) => {
        const force = int(next, 10, 60), area = choose(next, [100, 200, 250, 400, 500]);
        return { prompt: '轴向拉力 ' + force + ' kN 作用在截面积 ' + area + ' mm² 的杆件上，正应力是？', correct: fixed(force * 1000 / area, 2) + ' MPa', distractors: [fixed(force / area, 2) + ' MPa', fixed(force * area / 1000, 2) + ' MPa', fixed(force * 1000 / (area * 2), 2) + ' MPa'] };
      },
      (next) => {
        const length = choose(next, [1, 2, 4, 5]), change = int(next, 1, 8);
        return { prompt: '杆件原长 ' + length + ' m，受拉后伸长 ' + change + ' mm，线应变是？', correct: fixed(change / (length * 1000), 5), distractors: [fixed(change / length, 5), fixed(change / (length * 100), 5), fixed(length / change, 5)] };
      },
      (next) => {
        const force = int(next, 20, 100);
        return { prompt: '简支梁跨中受集中力 ' + force + ' kN，两端支座反力各为？', correct: fixed(force / 2, 1) + ' kN', distractors: [force + ' kN', fixed(force / 4, 1) + ' kN', fixed(force * 2, 1) + ' kN'] };
      },
      (next) => {
        const force = int(next, 20, 100), span = 10, distance = int(next, 2, 8);
        return { prompt: '简支梁跨度 ' + span + ' m，集中力 ' + force + ' kN 距左端 ' + distance + ' m，左端支座反力是？', correct: fixed(force * (span - distance) / span, 2) + ' kN', distractors: [fixed(force * distance / span, 2) + ' kN', fixed(force / 2, 1) + ' kN', force + ' kN'] };
      },
      (next) => {
        const ultimate = choose(next, [300, 400, 500, 600]), allowable = choose(next, [100, 150, 200]);
        return { prompt: '材料极限应力 ' + ultimate + ' MPa，许用应力 ' + allowable + ' MPa，安全系数是？', correct: fixed(ultimate / allowable, 2), distractors: [fixed(allowable / ultimate, 2), String(ultimate - allowable), String(ultimate + allowable)] };
      }
    ],
    accounting: [
      (next) => {
        const liability = int(next, 20, 80), equity = int(next, 20, 80);
        return { prompt: '企业负债 ' + liability + ' 万元、所有者权益 ' + equity + ' 万元，资产总额是？', correct: liability + equity + ' 万元', distractors: [liability - equity + ' 万元', liability * equity + ' 万元', equity - liability + ' 万元'] };
      },
      (next) => {
        const revenue = int(next, 50, 200), expense = int(next, 20, revenue - 1);
        return { prompt: '营业收入 ' + revenue + ' 万元、营业成本与费用合计 ' + expense + ' 万元，净利润是？', correct: revenue - expense + ' 万元', distractors: [revenue + expense + ' 万元', expense + ' 万元', fixed(revenue / expense, 2) + ' 万元'] };
      },
      (next) => {
        const revenue = int(next, 80, 200), cost = int(next, 20, revenue - 1);
        return { prompt: '销售收入 ' + revenue + ' 万元，销售成本 ' + cost + ' 万元，毛利是？', correct: revenue - cost + ' 万元', distractors: [revenue + cost + ' 万元', cost + ' 万元', fixed(revenue / cost, 2) + ' 万元'] };
      },
      (next) => {
        const assets = choose(next, [100, 200, 300, 400]), liabilities = choose(next, [50, 100, 200]);
        return { prompt: '流动资产 ' + assets + ' 万元、流动负债 ' + liabilities + ' 万元，流动比率是？', correct: fixed(assets / liabilities, 2), distractors: [fixed(liabilities / assets, 2), String(assets - liabilities), String(assets + liabilities)] };
      }
    ],
    finance: [
      (next) => {
        const principal = choose(next, [1000, 2000, 5000]), rate = choose(next, [0.05, 0.1]), years = int(next, 1, 3);
        return { prompt: '本金 ' + principal + ' 元，年利率 ' + rate * 100 + '%，按复利计算 ' + years + ' 年后的本利和是？', correct: fixed(principal * (1 + rate) ** years, 2) + ' 元', distractors: [fixed(principal * (1 + rate * years), 2) + ' 元', fixed(principal * rate * years, 2) + ' 元', fixed(principal * (1 + rate * 2), 2) + ' 元'] };
      },
      (next) => {
        const start = choose(next, [100, 200, 500]), percent = choose(next, [10, 20, 25]);
        return { prompt: '某资产从 ' + start + ' 元涨到 ' + fixed(start * (1 + percent / 100), 2) + ' 元，收益率是？', correct: percent + '%', distractors: [fixed(percent / 2, 1) + '%', percent * 2 + '%', fixed(100 / percent, 2) + '%'] };
      },
      (next) => {
        const first = int(next, 5, 15), second = int(next, 1, 10);
        return { prompt: '投资有 30% 概率收益 ' + first + '%、70% 概率收益 ' + second + '%，预期收益率是？', correct: fixed((30 * first + 70 * second) / 100, 2) + '%', distractors: [fixed((first + second) / 2, 2) + '%', fixed(first + second, 2) + '%', fixed((first - second) / 2, 2) + '%'] };
      },
      (next) => {
        const initial = choose(next, [100, 200, 400]), annual = choose(next, [20, 40, 50]);
        return { prompt: '项目初始投资 ' + initial + ' 万元，每年净现金流 ' + annual + ' 万元，静态投资回收期是？', correct: fixed(initial / annual, 2) + ' 年', distractors: [fixed(annual / initial, 2) + ' 年', initial + annual + ' 年', fixed(initial / (annual * 2), 2) + ' 年'] };
      }
    ],
    economics: [
      (next) => {
        const price = choose(next, [10, 20, 25]), quantity = choose(next, [10, 20, 40, 50]);
        return { prompt: '价格上涨 ' + price + '% 使需求量下降 ' + quantity + '%，需求价格弹性（取绝对值）是？', correct: fixed(quantity / price, 2), distractors: [fixed(price / quantity, 2), fixed((quantity + price) / 100, 2), String(quantity - price)] };
      },
      (next) => {
        const amount = choose(next, [100, 200, 500, 1000]), rate = choose(next, [6.5, 7, 7.2]);
        return { prompt: '按 1 外币 = ' + rate + ' 元人民币计算，' + amount + ' 外币可兑换多少元人民币？', correct: fixed(amount * rate, 2) + ' 元', distractors: [fixed(amount / rate, 2) + ' 元', fixed(amount + rate, 2) + ' 元', fixed(amount * rate / 10, 2) + ' 元'] };
      },
      (next) => {
        const startQuantity = int(next, 10, 50), endQuantity = startQuantity + int(next, 5, 20);
        const startCost = startQuantity * int(next, 2, 6), endCost = startCost + int(next, 20, 80);
        return { prompt: '产量从 ' + startQuantity + ' 增加到 ' + endQuantity + ' 时，总成本从 ' + startCost + ' 增加到 ' + endCost + '，边际成本约为？', correct: fixed((endCost - startCost) / (endQuantity - startQuantity), 2), distractors: [fixed(endCost / endQuantity, 2), fixed((endCost - startCost) / (endQuantity + startQuantity), 2), fixed(endCost - startCost, 2)] };
      }
    ],
    operations: [
      (next) => {
        const minutes = choose(next, [240, 300, 360, 480]), perUnit = choose(next, [4, 5, 6, 8]);
        return { prompt: '一条产线可用 ' + minutes + ' 分钟，每件产品需要 ' + perUnit + ' 分钟，理论产能是？', correct: fixed(minutes / perUnit, 2) + ' 件', distractors: [minutes * perUnit + ' 件', fixed(minutes / perUnit / 2, 2) + ' 件', minutes + perUnit + ' 件'] };
      },
      (next) => {
        const capacity = choose(next, [100, 200, 250, 400]), actual = capacity * choose(next, [0.6, 0.75, 0.8, 0.9]);
        return { prompt: '设备理论产能 ' + capacity + ' 件，实际产出 ' + actual + ' 件，产能利用率是？', correct: fixed(actual / capacity * 100, 1) + '%', distractors: [fixed(capacity / actual * 100, 1) + '%', fixed((capacity - actual) / capacity * 100, 1) + '%', fixed(actual / capacity * 10, 1) + '%'] };
      },
      (next) => {
        const times = [int(next, 2, 6), int(next, 1, 5), int(next, 2, 6), int(next, 1, 4)];
        const total = times.reduce((sum, value) => sum + value, 0);
        return { prompt: '某项目四道工序的持续时间分别为 ' + times.join('、') + ' 天，若串行执行，总工期是？', correct: total + ' 天', distractors: [Math.max(...times) + ' 天', total + Math.min(...times) + ' 天', total * 2 + ' 天'] };
      }
    ],
    project: [
      (next) => {
        const times = [int(next, 2, 6), int(next, 1, 5), int(next, 2, 6), int(next, 1, 4)];
        const total = times.reduce((sum, value) => sum + value, 0);
        return { prompt: '项目四道工序的持续时间分别为 ' + times.join('、') + ' 天，若串行执行，总工期是？', correct: total + ' 天', distractors: [Math.max(...times) + ' 天', total + Math.min(...times) + ' 天', total * 2 + ' 天'] };
      },
      (next) => {
        const a = int(next, 2, 6), b = int(next, 2, 6), c = int(next, 2, 6), d = int(next, 2, 6);
        const first = a + b, second = c + d;
        return { prompt: '项目有两条并行路径：路径 A 需 ' + a + ' 天和 ' + b + ' 天，路径 B 需 ' + c + ' 天和 ' + d + ' 天。项目最短完工时间是？', correct: Math.max(first, second) + ' 天', distractors: [Math.min(first, second) + ' 天', first + second + ' 天', Math.abs(first - second) + ' 天'] };
      },
      (next) => {
        const optimistic = int(next, 1, 6), likely = optimistic + int(next, 2, 4), pessimistic = likely + int(next, 2, 4);
        const expected = (optimistic + 4 * likely + pessimistic) / 6;
        return { prompt: '某工序乐观工期 ' + optimistic + ' 天、最可能工期 ' + likely + ' 天、悲观工期 ' + pessimistic + ' 天，PERT 预期工期是？', correct: fixed(expected, 2) + ' 天', distractors: [fixed((optimistic + likely + pessimistic) / 3, 2) + ' 天', pessimistic + ' 天', fixed((optimistic + pessimistic) / 2, 2) + ' 天'] };
      }
    ],
    international: [
      (next) => {
        const amount = choose(next, [100, 200, 500, 1000]), rate = choose(next, [6.5, 7, 7.2]);
        return { prompt: '按 1 外币 = ' + rate + ' 元人民币计算，' + amount + ' 外币可兑换多少元人民币？', correct: fixed(amount * rate, 2) + ' 元', distractors: [fixed(amount / rate, 2) + ' 元', fixed(amount + rate, 2) + ' 元', fixed(amount * rate / 10, 2) + ' 元'] };
      },
      (next) => {
        const amount = choose(next, [1400, 2100, 3500]), rate = choose(next, [6.5, 7, 7.5]);
        return { prompt: '按 1 外币 = ' + rate + ' 元人民币计算，' + amount + ' 元人民币可兑换多少外币？', correct: fixed(amount / rate, 2) + ' 外币', distractors: [fixed(amount * rate, 2) + ' 外币', fixed(amount - rate, 2) + ' 外币', fixed(amount / rate / 10, 2) + ' 外币'] };
      },
      (next) => {
        const fob = choose(next, [100, 200, 300]), freight = choose(next, [10, 20, 30]), insurance = choose(next, [5, 10, 15]);
        return { prompt: '一批货物 FOB 价 ' + fob + ' 万元，运费 ' + freight + ' 万元，保险费 ' + insurance + ' 万元，CIF 价是？', correct: fob + freight + insurance + ' 万元', distractors: [fob + freight + ' 万元', fob + insurance + ' 万元', fob * 2 + ' 万元'] };
      },
      (next) => {
        const price = choose(next, [100, 200, 400]), tariff = choose(next, [5, 10, 15]);
        return { prompt: '进口货物完税价格 ' + price + ' 万元，关税税率 ' + tariff + '%，应缴关税是？', correct: fixed(price * tariff / 100, 2) + ' 万元', distractors: [fixed(price * tariff / 1000, 2) + ' 万元', fixed(price + tariff, 2) + ' 万元', fixed(price / tariff, 2) + ' 万元'] };
      }
    ],
    traffic: [
      (next) => {
        const density = int(next, 20, 80), speed = int(next, 20, 60);
        return { prompt: '某路段交通密度为 ' + density + ' 辆/km，平均速度为 ' + speed + ' km/h，交通流量约为？', correct: density * speed + ' 辆/h', distractors: [density + speed + ' 辆/h', fixed(speed / density, 2) + ' 辆/h', density * speed * 2 + ' 辆/h'] };
      },
      (next) => {
        const headway = int(next, 2, 6);
        return { prompt: '一条车道的最小车头时距为 ' + headway + ' 秒，理论通行能力约为？', correct: fixed(3600 / headway, 0) + ' 辆/h', distractors: [fixed(headway * 60, 0) + ' 辆/h', fixed(3600 / headway / 2, 0) + ' 辆/h', fixed(3600 * headway, 0) + ' 辆/h'] };
      },
      (next) => {
        const headway = int(next, 6, 12);
        return { prompt: '铁路区间追踪列车间隔为 ' + headway + ' 分钟，按 1440 分钟计算，通过能力约为？', correct: fixed(1440 / headway, 0) + ' 列/日', distractors: [fixed(headway * 60, 0) + ' 列/日', fixed(1440 / headway / 2, 0) + ' 列/日', fixed(1440 * headway, 0) + ' 列/日'] };
      },
      (next) => {
        const arrival = int(next, 2, 8), service = arrival + int(next, 2, 6);
        return { prompt: 'M/M/1 排队系统到达率 ' + arrival + ' 人/h、服务率 ' + service + ' 人/h，服务台利用率是？', correct: fixed(arrival / service, 2), distractors: [fixed(service / arrival, 2), fixed(arrival * service, 2), fixed(1 - arrival / service, 2)] };
      }
    ],
    soil: [
      (next) => {
        const total = int(next, 100, 300), pore = int(next, 20, 100);
        return { prompt: '某点总应力为 ' + total + ' kPa，孔隙水压力为 ' + pore + ' kPa，有效应力是？', correct: total - pore + ' kPa', distractors: [total + pore + ' kPa', pore + ' kPa', total + ' kPa'] };
      },
      (next) => {
        const voidVolume = fixed(int(next, 2, 6) / 10, 1), solidVolume = fixed(int(next, 5, 8) / 10, 1);
        return { prompt: '土体孔隙体积为 ' + voidVolume + ' m³、固体颗粒体积为 ' + solidVolume + ' m³，孔隙比 e 是？', correct: fixed(Number(voidVolume) / Number(solidVolume), 2), distractors: [fixed(Number(solidVolume) / Number(voidVolume), 2), fixed(Number(voidVolume) + Number(solidVolume), 2), fixed(Number(voidVolume) * Number(solidVolume), 2)] };
      },
      (next) => {
        const waterVolume = fixed(int(next, 1, 5) / 10, 1), voidVolume = fixed(int(next, 5, 8) / 10, 1);
        return { prompt: '土体孔隙体积为 ' + voidVolume + ' m³、孔隙水体积为 ' + waterVolume + ' m³，饱和度约为？', correct: fixed(Number(waterVolume) / Number(voidVolume) * 100, 0) + '%', distractors: [fixed(Number(voidVolume) / Number(waterVolume) * 100, 0) + '%', fixed((Number(voidVolume) - Number(waterVolume)) * 100, 0) + '%', fixed(Number(waterVolume) * 100, 0) + '%'] };
      }
    ],
    machine: [
      (next) => {
        const first = int(next, 15, 30), second = first * int(next, 2, 4);
        return { prompt: '一对齿轮齿数分别为 ' + first + ' 和 ' + second + '，传动比 i 是？', correct: fixed(second / first, 2), distractors: [fixed(first / second, 2), String(first + second), String(second - first)] };
      },
      (next) => {
        const input = choose(next, [500, 1000, 2000]), output = input * choose(next, [0.7, 0.8, 0.9]);
        return { prompt: '某机械输入功率 ' + input + ' W、输出功率 ' + output + ' W，机械效率是？', correct: fixed(output / input * 100, 0) + '%', distractors: [fixed(input / output * 100, 0) + '%', fixed((input - output) / input * 100, 0) + '%', fixed(output / input * 10, 0) + '%'] };
      },
      (next) => {
        const power = int(next, 2, 10), speed = choose(next, [1000, 1500, 2000, 3000]);
        return { prompt: '电机功率 ' + power + ' kW、转速 ' + speed + ' r/min，按 T=9550P/n，输出转矩约为？', correct: fixed(9550 * power / speed, 2) + ' N·m', distractors: [fixed(speed / (9550 * power), 2) + ' N·m', fixed(9550 * speed / power, 2) + ' N·m', fixed(power * speed / 9550, 2) + ' N·m'] };
      },
      (next) => {
        const diameter = choose(next, [0.1, 0.2, 0.3, 0.5]), speed = choose(next, [500, 800, 1200]);
        return { prompt: '带轮直径 ' + diameter + ' m、转速 ' + speed + ' r/min，带速约为？', correct: fixed(Math.PI * diameter * speed / 60, 2) + ' m/s', distractors: [fixed(diameter * speed / 60, 2) + ' m/s', fixed(Math.PI * diameter * speed, 2) + ' m/s', fixed(Math.PI * diameter / speed, 2) + ' m/s'] };
      }
    ],
    power: [
      (next) => {
        const current = int(next, 5, 20), factor = choose(next, [0.8, 0.9]);
        return { prompt: '三相对称负载线电压 380 V、线电流 ' + current + ' A、功率因数 ' + factor + '，有功功率约为？', correct: fixed(Math.sqrt(3) * 380 * current * factor / 1000, 2) + ' kW', distractors: [fixed(380 * current * factor / 1000, 2) + ' kW', fixed(Math.sqrt(3) * 380 * current / 1000, 2) + ' kW', fixed(3 * 380 * current * factor / 1000, 2) + ' kW'] };
      },
      (next) => {
        const high = choose(next, [10000, 35000, 110000]), low = choose(next, [400, 10000]);
        return { prompt: '变压器一次侧电压 ' + high + ' V、二次侧电压 ' + low + ' V，变比约为？', correct: fixed(high / low, 2), distractors: [fixed(low / high, 2), fixed(high + low, 2), fixed(high * low, 2)] };
      },
      (next) => {
        const frequency = choose(next, [50, 60]), poles = choose(next, [1, 2, 3]);
        return { prompt: '电源频率 ' + frequency + ' Hz、极对数为 ' + poles + ' 的同步电机，同步转速是？', correct: fixed(60 * frequency / poles, 0) + ' r/min', distractors: [fixed(60 * frequency * poles, 0) + ' r/min', fixed(frequency / poles, 0) + ' r/min', fixed(60 * poles / frequency, 0) + ' r/min'] };
      },
      (next) => {
        const current = int(next, 5, 20), resistance = choose(next, [0.1, 0.2, 0.5, 1]);
        return { prompt: '线路电流 ' + current + ' A、电阻 ' + resistance + ' Ω，线路有功损耗约为？', correct: fixed(current * current * resistance, 2) + ' W', distractors: [fixed(current * resistance, 2) + ' W', fixed(current * current / resistance, 2) + ' W', fixed(current * resistance * resistance, 2) + ' W'] };
      }
    ],
    signals: [
      (next) => {
        const maximum = choose(next, [2, 4, 8, 10]);
        return { prompt: '某模拟信号最高频率为 ' + maximum + ' kHz，按奈奎斯特采样定理，最低采样频率是？', correct: 2 * maximum + ' kHz', distractors: [maximum + ' kHz', maximum / 2 + ' kHz', 4 * maximum + ' kHz'] };
      },
      (next) => {
        const bandwidth = choose(next, [1, 2, 3]), snr = choose(next, [1, 3, 7, 15]);
        return { prompt: '信道带宽 ' + bandwidth + ' kHz、信噪比为 ' + snr + '，按香农公式，信道容量约为？', correct: fixed(bandwidth * Math.log2(1 + snr), 2) + ' kb/s', distractors: [fixed(bandwidth * snr, 2) + ' kb/s', fixed(bandwidth * Math.log2(snr), 2) + ' kb/s', fixed(bandwidth * (1 + snr), 2) + ' kb/s'] };
      },
      (next) => {
        const frequency = choose(next, [100, 150, 300, 600]);
        return { prompt: '频率为 ' + frequency + ' MHz 的电磁波，在自由空间中的波长约为？', correct: fixed(300 / frequency, 2) + ' m', distractors: [fixed(frequency / 300, 2) + ' m', fixed(300 * frequency, 2) + ' m', fixed(300 / frequency / 10, 2) + ' m'] };
      },
      (next) => {
        const frequency = choose(next, [50, 100, 200, 500]);
        return { prompt: '频率为 ' + frequency + ' Hz 的周期信号，其周期是？', correct: fixed(1000 / frequency, 2) + ' ms', distractors: [fixed(frequency / 1000, 2) + ' ms', fixed(1000 * frequency, 2) + ' ms', fixed(1 / frequency, 2) + ' ms'] };
      }
    ],
    ml: [
      (next) => {
        const correct = int(next, 50, 95), total = 100;
        return { prompt: '某分类器在 ' + total + ' 个样本中预测正确 ' + correct + ' 个，准确率是？', correct: correct + '%', distractors: [100 - correct + '%', fixed(correct / 2, 0) + '%', fixed(correct * 2, 0) + '%'] };
      },
      (next) => {
        const tp = int(next, 20, 60), fp = int(next, 5, 30);
        return { prompt: '某二分类器 TP=' + tp + '、FP=' + fp + '，精确率约为？', correct: fixed(tp / (tp + fp) * 100, 2) + '%', distractors: [fixed(fp / (tp + fp) * 100, 2) + '%', fixed(tp / fp * 100, 2) + '%', fixed((tp + fp) / tp * 100, 2) + '%'] };
      },
      (next) => {
        const tp = int(next, 20, 60), fn = int(next, 5, 30);
        return { prompt: '某二分类器 TP=' + tp + '、FN=' + fn + '，召回率约为？', correct: fixed(tp / (tp + fn) * 100, 2) + '%', distractors: [fixed(fn / (tp + fn) * 100, 2) + '%', fixed(tp / fn * 100, 2) + '%', fixed((tp + fn) / tp * 100, 2) + '%'] };
      },
      (next) => {
        const input = choose(next, [16, 32, 64]), kernel = choose(next, [3, 5]), stride = choose(next, [1, 2]);
        const output = Math.floor((input - kernel) / stride) + 1;
        return { prompt: '输入尺寸 ' + input + '、卷积核 ' + kernel + '、步长 ' + stride + '、无填充，输出尺寸是？', correct: output + '', distractors: [String(input - kernel + 1), String(Math.floor(input / stride)), String(output + kernel)] };
      },
      (next) => {
        const weight = fixed(int(next, 2, 9) / 10, 1), gradient = fixed(int(next, 1, 9) / 10, 1), rate = choose(next, [0.1, 0.01]);
        return { prompt: '权重 w=' + weight + '、梯度 g=' + gradient + '、学习率 η=' + rate + '，按 w←w-ηg 更新后 w 约为？', correct: fixed(Number(weight) - rate * Number(gradient), 2), distractors: [fixed(Number(weight) + rate * Number(gradient), 2), fixed(rate * Number(gradient), 2), fixed(Number(weight) * rate, 2)] };
      }
    ]
  };

  function courseById(id) {
    return COURSES.find((course) => course.id === id) || null;
  }
  function coursesForTerm(term, backgroundId, major) {
    return COURSES.filter((course) => course.term === term
      && (course.background === 'common' || course.background === backgroundId)
      && (!course.major || !major || course.major === major));
  }
  function generatedQuestion(course, next, serial, usedTypes) {
    const topics = TOPICS[course.topic];
    if (!Array.isArray(topics) || !topics.length) return null;
    const available = topics
      .map((generator, index) => ({ generator, templateId: course.topic + ':' + index }))
      .filter(({ templateId }) => !usedTypes.has(templateId));
    if (!available.length) return null;
    const picked = choose(next, available);
    usedTypes.add(picked.templateId);
    const raw = picked.generator(next, course);
    const question = makeChoice(raw.prompt, raw.correct, raw.distractors, next);
    return { ...question, id: 'gen-' + course.id + '-' + serial, templateId: picked.templateId };
  }
  function bankQuestion(course, next, used) {
    const pool = (QUESTIONS[course.subject] || []).filter((question) => !used.has(question.id));
    if (!pool.length) return null;
    const picked = choose(next, pool);
    used.add(picked.id);
    return { ...fromBank(picked, next), id: picked.id, subject: course.subject, courseId: course.id, courseName: course.name, points: 20 };
  }
  function generateExam(courseIds, seed, randomApi) {
    const courses = courseIds.map(courseById).filter(Boolean);
    if (courses.length !== courseIds.length || !courses.length) throw new Error('试卷课程无效');
    let rng = randomApi.create(String(seed));
    const next = () => { const drawn = randomApi.draw(rng); rng = drawn.rng; return drawn.number; };
    const used = new Set();
    const usedTypes = new Set();
    const questions = [];
    let serial = 0;
    const add = (course) => {
      const generated = generatedQuestion(course, next, ++serial, usedTypes);
      if (generated) {
        questions.push({ ...generated, subject: course.subject, courseId: course.id, courseName: course.name, points: 20 });
        return true;
      }
      const banked = bankQuestion(course, next, used);
      if (!banked) return false;
      questions.push(banked);
      return true;
    };
    for (const course of courses) {
      if (!add(course)) throw new Error('课程题库不足，无法生成试卷');
    }
    while (questions.length < 5) {
      if (!add(choose(next, courses))) {
        const fallback = Object.entries(QUESTIONS).flatMap(([subject, list]) => list.filter((question) => !used.has(question.id)).map((question) => ({ subject, question })));
        if (!fallback.length) break;
        const picked = choose(next, fallback);
        used.add(picked.question.id);
        const base = fromBank(picked.question, next);
        questions.push({ ...base, id: picked.question.id, subject: picked.subject, courseId: courses[0].id, courseName: courses[0].name, points: 20 });
      }
    }
    for (let index = questions.length - 1; index > 0; index--) {
      const swap = Math.min(index, Math.floor(next() * (index + 1)));
      [questions[index], questions[swap]] = [questions[swap], questions[index]];
    }
    if (questions.length !== 5) throw new Error('题库不足，无法生成 5 道题');
    return { generator: 'v2', questions, answers: [], score: null, submitted: false };
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
  const api = { SUBJECTS, COURSES, QUESTIONS, LEGACY_QUESTIONS, TOPICS, courseById, coursesForTerm, generateExam, ratingFor, gradeFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusCourses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
