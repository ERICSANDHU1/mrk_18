"""B1 — the Bearer auth requirement is visible in the OpenAPI schema, so /docs
shows an Authorize button and generated clients know auth is required."""


async def test_openapi_declares_bearer_scheme(client):
    schema = (await client.get("/openapi.json")).json()
    schemes = schema["components"]["securitySchemes"]
    assert "BearerJWT" in schemes
    assert schemes["BearerJWT"]["type"] == "http"
    assert schemes["BearerJWT"]["scheme"] == "bearer"


async def test_protected_route_carries_security_requirement(client):
    schema = (await client.get("/openapi.json")).json()
    op = schema["paths"]["/runs/{run_id}"]["get"]
    assert any("BearerJWT" in (req or {}) for req in op.get("security", []))


async def test_health_is_public_in_openapi(client):
    schema = (await client.get("/openapi.json")).json()
    op = schema["paths"]["/health"]["get"]
    assert not op.get("security")  # health needs no auth
