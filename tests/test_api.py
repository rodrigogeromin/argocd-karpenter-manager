"""API contract tests use fixtures and never contact a cluster."""
import os

os.environ["KARPENTER_DEMO_MODE"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from api.main import CONTEXT, FIXTURES, app, resource_path  # noqa: E402

HEADERS = {
    "Argocd-Application-Name": CONTEXT["argocd-application-name"],
    "Argocd-Project-Name": CONTEXT["argocd-project-name"],
}
CLUSTER = "demo-cluster"


def setup_function():
    """Restore shared fixture objects before each test."""
    FIXTURES["nodepools"][0]["spec"] = {
        "template": {"spec": {"requirements": [{"key": "kubernetes.io/arch", "operator": "In", "values": ["amd64"]}]}}
    }
    FIXTURES["ec2nodeclasses"][0]["spec"] = {
        "amiSelectorTerms": [{"alias": "al2023@latest"}], "role": "KarpenterNodeRole-demo"
    }


def test_lists_clusters_and_both_resource_types():
    with TestClient(app) as client:
        clusters = client.get("/api/v1/clusters", headers=HEADERS)
        pools = client.get(f"/api/v1/clusters/{CLUSTER}/nodepools", headers=HEADERS)
        classes = client.get(f"/api/v1/clusters/{CLUSTER}/ec2nodeclasses", headers=HEADERS)
    assert clusters.status_code == 200
    assert clusters.json()["items"][0]["id"] == CLUSTER
    assert pools.status_code == 200
    assert pools.json()["items"][0]["metadata"]["name"] == "general-purpose"
    assert classes.status_code == 200
    assert classes.json()["items"][0]["metadata"]["name"] == "default"


def test_patch_changes_only_spec_in_selected_cluster():
    with TestClient(app) as client:
        response = client.patch(
            f"/api/v1/clusters/{CLUSTER}/nodepools/general-purpose",
            headers=HEADERS,
            json={"spec": {"disruption": {"consolidationPolicy": "WhenEmpty"}}},
        )
    assert response.status_code == 200
    assert response.json()["spec"]["disruption"]["consolidationPolicy"] == "WhenEmpty"
    assert response.json()["metadata"]["resourceVersion"] == "1"


def test_unknown_cluster_is_not_accepted():
    with TestClient(app) as client:
        response = client.get("/api/v1/clusters/not-registered/nodepools", headers=HEADERS)
    assert response.status_code == 404


def test_proxy_context_is_required_for_reads_and_writes():
    with TestClient(app) as client:
        response = client.get("/api/v1/clusters", headers={})
    assert response.status_code == 403


def test_patch_rejects_metadata_changes():
    with TestClient(app) as client:
        response = client.patch(
            f"/api/v1/clusters/{CLUSTER}/nodepools/general-purpose",
            headers=HEADERS,
            json={"metadata": {"labels": {"example": "value"}}, "spec": {}},
        )
    assert response.status_code == 422


def test_crd_api_groups_and_resource_names_are_correct():
    assert resource_path("nodepools") == "/apis/karpenter.sh/v1/nodepools"
    assert resource_path("ec2nodeclasses") == "/apis/karpenter.k8s.aws/v1/ec2nodeclasses"
    assert resource_path("nodepools", "pool with spaces") == "/apis/karpenter.sh/v1/nodepools/pool%20with%20spaces"
