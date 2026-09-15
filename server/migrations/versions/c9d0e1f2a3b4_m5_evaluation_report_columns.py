"""M5: evaluation_reports 改列（overall_score + report JSON，替代 M1 预留旧列）

M1 预建的 scores/summary/suggestions 旧列从未写入（M0-M4 无评分功能），
直接替换为 M5 实际结构：overall_score 单列（列表展示/排序）+ report
JSONB（InterviewReport 全量 dump，维度列表由 rubric 模板驱动）。

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-09-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "c9d0e1f2a3b4"
down_revision: str | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("evaluation_reports", "scores")
    op.drop_column("evaluation_reports", "summary")
    op.drop_column("evaluation_reports", "suggestions")
    op.add_column(
        "evaluation_reports",
        sa.Column("overall_score", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "evaluation_reports",
        sa.Column("report", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("evaluation_reports", "report")
    op.drop_column("evaluation_reports", "overall_score")
    # server_default 兜底：表内已有数据时 NOT NULL 旧列才有合法回填值
    op.add_column(
        "evaluation_reports",
        sa.Column("scores", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.add_column(
        "evaluation_reports",
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "evaluation_reports",
        sa.Column("suggestions", sa.Text(), nullable=False, server_default=""),
    )
