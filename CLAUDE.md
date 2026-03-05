# CLAUDE.md — MCI Concord 多智能体系统

> 全局规则见 `~/.claude/CLAUDE.md`，本文件为项目专属补充规则。

## 项目简介

MCI Concord 监狱拆除多智能体对话演化系统。三个 Agent（监狱/开发商/小镇）围绕 51 英亩地块进行自治博弈，接入实时天气/时间数据作为动态参数。

## 技术栈

- **API**：Gemini（主），Claude 作为开发辅助
- **RAG 知识库**：每个 Agent 独立向量库，支持 PDF/TXT/MD 上传
- **环境数据**：波士顿实时天气/时间（OpenWeatherMap 或类似服务）
- **后台管理**：Admin Dashboard，分离管理 System Prompt 与 RAG

## 关键文件

| 文件 | 说明 |
|------|------|
| `System Prompt Agent_Prison.md` | 监狱实体人设 |
| `System Prompt Agent_Developer.md` | 开发商人设 |
| `System Prompt Agent_Town.md` | 小镇委员会人设 |
| `AgentPrison_knowledgebase/` | 监狱专属 RAG 素材 |
| `AgentDeveloper_knowledgebase/` | 开发商专属 RAG 素材 |
| `AgentTown_knowledgebase/` | 小镇专属 RAG 素材 |
| `# 【PRD】MCI Concord Prison.md` | 完整产品需求文档 |

## 核心设计原则

1. **立场绝对排他**：Agent 之间利益冲突不可调和，不能出现妥协倾向
2. **人设与记忆解耦**：System Prompt 定义"三观"，RAG 定义"阅历"
3. **实时物理感知**：天气/时间必须在每轮调用前注入

## 大任务先计划

涉及以下内容时，必须进入计划模式后再执行：
- 修改任意 Agent 的 System Prompt
- 调整 Orchestrator 调度逻辑
- 改动 RAG 向量化/检索流程
- 新增环境数据接入

## 已知问题

<!-- 格式：- [日期] 错误描述 → 正确做法 -->
