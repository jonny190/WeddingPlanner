from tests.conftest import PNG_BYTES, sign_up


def upload(api, wedding, content=PNG_BYTES, name="photo.png", expected=201):
    return api.post(
        f"/weddings/{wedding['id']}/media",
        expected=expected,
        files={"file": (name, content, "application/octet-stream")},
    )


def test_upload_list_serve_and_delete(api, client, wedding):
    asset = upload(api, wedding, name="../../etc/passwd.png").json()
    assert asset["content_type"] == "image/png"
    assert asset["filename"] == "passwd.png"
    assert asset["url"] == f"/api/v1/public/media/{asset['id']}"
    assert [a["id"] for a in api.get(f"/weddings/{wedding['id']}/media").json()] == [asset["id"]]

    served = client.get(asset["url"])
    assert served.status_code == 200
    assert served.content == PNG_BYTES
    assert served.headers["content-type"] == "image/png"
    assert served.headers["x-content-type-options"] == "nosniff"

    api.delete(f"/weddings/{wedding['id']}/media/{asset['id']}")
    assert client.get(asset["url"]).status_code == 404


def test_only_real_images_are_accepted(api, wedding):
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    response = upload(api, wedding, content=svg, name="logo.png", expected=400)
    assert response.json()["code"] == "unsupported_media"
    upload(api, wedding, content=b"<html></html>", expected=400)


def test_upload_size_limit(api, client, wedding, settings):
    too_big = PNG_BYTES + b"\0" * settings.max_upload_bytes
    assert upload(api, wedding, content=too_big, expected=400).json()["code"] == "file_too_large"


def test_other_tenants_cannot_manage_assets(api, client, wedding):
    asset = upload(api, wedding).json()
    other = sign_up(client, "other@example.com", "Other")
    other.get(f"/weddings/{wedding['id']}/media", expected=404)
    other.delete(f"/weddings/{wedding['id']}/media/{asset['id']}", expected=404)
