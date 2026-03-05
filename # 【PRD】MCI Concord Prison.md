# 【PRD】MCI Concord 监狱拆除多智能体对话演化系统 (v2.0)

## 1. 背景与目标

**背景：**

随着马萨诸塞州 MCI Concord 监狱（1878-2024）的正式关闭，围绕其 51 英亩地块的拆除与重建引发了多方利益与情感冲突。本项目旨在通过多智能体（Multi-Agent）技术，模拟“监狱实体”、“开发商/州政府”与“康科德小镇社区”三方的自治博弈过程。

**需求目标：**

基于全新的 **Gemini 3 API** 构建系统架构。开发一套包含独立配置后台（Admin Dashboard）的对话引擎，允许创作者**分离管理**每个 Agent 的“系统人设设定（System Prompt）”与“专属历史记忆（RAG 知识库）”，并在前端呈现三方外挂实时物理环境数据（天气/时间）的无干预动态剧情演化。

---

## 2. 需求概述

**核心原则：**

1. ​**立场绝对排他原则（Zero-Sum Principle）**​：Agent 之间核心利益冲突不可调和。
2. ​**实时物理感知原则（Real-time Grounding）**​：虚拟环境需与真实物理世界（波士顿实时天气/时间）严格对齐并作为动态参数注入。
3. ​**人设与记忆解耦原则（Decoupling Persona & Memory）**​：
   * ​**System Prompt**​：定义 Agent 的“三观”、语气、性格与不可跨越的规则底线。
   * ​**RAG Knowledge Base**​：定义 Agent 的“阅历”，包含上传的 PDF、TXT、采访记录等，按需检索并作为 Context 拼接。

---

## 3. 需求详情 (核心机制设计)

### 3.1 Agent 配置与后台管理模块 (Admin UI & Logic)

为了支持“提示词”与“知识库”的分离，需开发独立的配置控制台。

| **模块类别**         | **字段/功能项** | **交互形式** | **执行逻辑 (Boolean/Condition)**                                                                                          |  |  |  |  |
| ---------------------------- | ----------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -- | -- | -- | -- |
| **System Prompt 配置**    | 角色设定 (Persona)    | 文本域 (Textarea)  | `if (prompt_updated) { update_agent_config(Agent_ID); }`                                                                    |
|                            | 语气与底线 (Rules)    | 文本域 (Textarea)  | 强制与 Persona 拼接为完整的 System Message。                                                                                    |
| **知识库上传 (RAG Base)** | 本地文件上传          | 拖拽上传组件       | 支持`.txt, .pdf, .md`。`if (valid_format) { extract_text() -> chunk() -> vectorize() -> store_in_vectorDB(Agent_ID); }` |
|                            | 在线 URL 抓取         | 输入框             | `if (valid_url) { scrape_content() -> vectorize(); }`                                                                       |

### 3.2 核心 Agent 逻辑矩阵 (基于分离架构)

| **Agent 标识**  | **独立 System Prompt (灵魂设定)**                                                                                                      | **独立 RAG 知识库 (外挂记忆)**                                      | **触发发言逻辑 (Routing)**           |  |  |  |  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- | -- | -- | -- | -- |
| **Agent\_Prison**    | “你是 MCI Concord 监狱物理实体。你拥有 146 年寿命，当前面临被抹除的极度恐惧。你愤怒、悲伤、固执。你不是人类，只能通过墙壁和管道感知世界。” | - 历代越狱记录 (PDF)- 囚犯刻在墙上的诗歌 (TXT)- 建筑结构图文字描述 (MD) | `if (is_turn(Prison)) return true;`    |
| **Agent\_Developer** | “你是冷酷、追求极致效率的开发商。你的唯一目的是低成本拆除监狱并盖楼赚钱。你鄙视对旧建筑的感伤，说话带商业精英的傲慢。”                     | - 康科德地价评估报告 (PDF)- 爆破工程成本明细表 (Excel/CSV 转 TXT)        | `if (is_turn(Developer)) return true;` |
| **Agent\_Town**      | “你是康科德小镇居民自治委员会。你既警惕开发商的贪婪，又不想留着一座破旧监狱。你极其关注交通拥堵、学区资源和历史遗迹象征性保留。”           | - 居民抗议信件合集 (TXT)- 镇议会规划法案 (PDF)                           | `if (is_turn(Town)) return true;`      |

### 3.3 运行期对话组装引擎 (Prompt Assembly Engine)

在调度器（Orchestrator）调用 Gemini 3 API 之前，必须执行以下组装逻辑（伪代码/XML 结构模拟）：

XML

```
<invoke name='call_gemini_3_api'>
  <parameter name='model'>gemini-3.0-pro</parameter>

  <parameter name='system_prompt'>[来自 Admin 配置的 Agent System Prompt]</parameter>

  <parameter name='dynamic_sensors'>
    {"time": "02:30 AM", "weather": "Heavy Rain", "temp_c": 3}
  </parameter>

  <parameter name='retrieved_memory'>
    [系统根据当前话题，从 Agent 的知识库中向量检索出的 Top-3 Chunk]
  </parameter>

  <parameter name='global_context'>
    [Developer]: "我们要把南墙推倒建商场。"
    [Town]: "南墙靠近公路，粉尘怎么处理？"
  </parameter>
</invoke>
```

---

## 4. 异常处理与边界

| **边界场景**               | **风险评估** | **处理逻辑 (Exception Handling)**                                                                                                               |  |  |  |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -- | -- | -- |
| **RAG 知识库无匹配项**          | 回答空洞           | 若`Vector_Search_Score < Threshold`，触发降级逻辑：清空`retrieved_memory`，要求 Agent 仅依赖 System Prompt 结合当前情境自由发挥。             |
| **上传了不支持的文件/解析乱码** | 向量数据库污染     | ​**前置拦截**​：若文件解析返回乱码率 > 20%，抛出`FileParseError`并在前端 Admin 提示“文件解析失败，请检查编码格式”。                          |
| **Agent 发言突破立场红线**      | 剧情崩塌           | ​**内容审查器**​：对话生成后，经由轻量级分类器校验。若识别到`Prison`说出“我同意拆除”，直接丢弃该回复，调高 Temperature 重新生成。            |
| **API 调用超时 (Timeout)**      | 流程阻塞           | 设定 Gemini 3 API 最大超时时间`timeout = 15s`。若超时，重试 2 次。若仍失败，注入系统独白：“[天空一阵沉寂，时间暂时凝固]”，跳过当前 Agent 轮次。 |
