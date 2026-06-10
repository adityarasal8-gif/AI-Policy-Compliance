import requests

res = requests.post("http://localhost:8000/upload-policy", files={"file": ("test.txt", b"Hello World")}, data={"policy_name": "Test"})
print(res.status_code)
print(res.text)
