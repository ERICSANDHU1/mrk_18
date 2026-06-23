"""C5 — the schema-version health check passes on a fully-migrated DB."""

from mrk18_execution.db.schema_health import check_schema


async def test_schema_health_ok_on_current_db(engine):
    # the test engine creates the full Base.metadata → schema is current
    result = await check_schema(engine)
    assert result["ok"], result
    assert result["missing"] == []
