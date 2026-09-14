请根据以下信息提出第 {{ question_index }} 个面试问题（本岗位面试共约 {{ max_questions }} 个问题）。

题目类型：{{ question_type_label }}
{% if topic %}本题题材：围绕「{{ topic }}」展开。
{% endif %}{% if retrieved_context %}
以下是候选人简历中与本题相关的片段（出题依据，不得直接照抄原文）：
{{ retrieved_context }}
{% endif %}
{% if asked_questions %}已经问过的问题（不要重复或变相重复）：
{{ asked_questions }}
{% endif %}
出题要求：
- basic：考察岗位基础知识与技术理解，不针对具体项目；
- project：深挖候选人简历中的项目/工作经历，考察决策与权衡；
- deep_dive：围绕题材做技术原理与工程实践的深度考察。
- 问题须具体、可回答，避免空泛；结合 JD 要求与简历内容设定考察点。

## 候选人简历

{{ resume_context }}

## 岗位 JD 要点

{{ jd_key_points }}
