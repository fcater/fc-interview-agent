"""M3: resumes.vector_ids（简历切片向量 id，删除简历时同步清理向量）

Revision ID: a1f2c3d4e5f6
Revises: 188ddd3580b7
Create Date: 2026-09-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1f2c3d4e5f6"
down_revision: str | None = "188ddd3580b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "resumes",
        sa.Column("vector_ids", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("resumes", "vector_ids")
