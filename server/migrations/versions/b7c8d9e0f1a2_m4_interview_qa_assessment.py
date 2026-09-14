"""M4: interview_qa.assessment（判答简评，供回看与 M5 评分依据）

Revision ID: b7c8d9e0f1a2
Revises: a1f2c3d4e5f6
Create Date: 2026-09-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "a1f2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("interview_qa", sa.Column("assessment", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("interview_qa", "assessment")
