---
title: "SQL Injection in Login"
contest: "IDEK"
category: "CTF"
difficulty: "Medium"
points: 150
tags: ["Web","sql-injection", "authentication-bypass"]
publishedAt: 2023-08-15
solved: true
---

# SQL Injection Challenge

## Description
Tìm cách bypass authentication thông qua SQL injection...

## Solution
1. Phân tích source code
2. Tìm injection point
3. Craft payload...

## Flag
`SEKAI{sql_1nj3ct10n_1s_fun}`


```python
ciphertext = bytes.fromhex("3c2a21333f2b203f")

for key in range(256):
    decrypted = "".join(chr(b ^ key) for b in ciphertext)
    if decrypted.isprintable():
        print(f"Key={key}: {decrypted}")
```