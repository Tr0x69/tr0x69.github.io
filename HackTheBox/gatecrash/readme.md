---
layout: post
title:  "GateCrash"
date:   2025-03-16 12:32:45 +0100
permalink: /hackthebox/gatecrash/
---


# HTB - GateCrash
---
> Author: auk0x01
> Published: March 16, 2025
> Description: An administrative portal for the campus parking area has been identified, bypassing it's authentication and gaining access to the gate control would allow us to unlock it and use staff vehicles for securing the campus premises way faster.


---

<br>



There is only one page, and we can’t do anything with it. When I hit login, it gave the message “**Browser not supported**”. There is also nothing unusual when capturing the requests. Let’s dig in the source. 

![image.png](/assets/images/gatecrash/image.png)

![image.png](/assets/images/gatecrash/image1.png)

The application uses **Go** for the backend and **Fastify (JavaScript)** for the frontend. I also noticed that a [Nim](https://nim-lang.org/) package (version 1.2.4) is installed. I usually note these packages as these challenges often have their packages vulnerable. 

![image.png](/assets/images/gatecrash/image2.png)

## ***Objective***

Looking at the code, there's a **proxy server** that forwards requests from **`/user` to `/login`**. If the internal request is successful, we should be able to retrieve the flag.

We will focus on 2 main files which are: `main.go` and `main.nim`

`main.nim`
- Handle `/user` endpoint
- Forwards requests to internal

---

`main.go`
- Handles `/login` endpoint
- Contains user authentication logic

Here, before forwarding our request to the internal, our input go through a SQL Injection checks that only allows for letters and numbers `[a-z,A-Z,0-9]`.  However, the `user-agent` is used directly without any filtering.  

`main.nim`

```python
import asyncdispatch, strutils, jester, httpClient, json
import std/uri

const userApi = "http://127.0.0.1:9090"

proc msgjson(msg: string): string =
  """{"msg": "$#"}""" % [msg]

proc containsSqlInjection(input: string): bool =
  for c in input:
    let ordC = ord(c)
    if not ((ordC >= ord('a') and ordC <= ord('z')) or
            (ordC >= ord('A') and ordC <= ord('Z')) or
            (ordC >= ord('0') and ordC <= ord('9'))):
      return true
  return false

settings:
  port = Port 1337

routes:
  post "/user":
    let username = @"username"
    let password = @"password"

    if containsSqlInjection(username) or containsSqlInjection(password):
      resp msgjson("Malicious input detected")

    let userAgent = decodeUrl(request.headers["user-agent"])

    let jsonData = %*{
      "username": username,
      "password": password
    }

    let jsonStr = $jsonData

    let client = newHttpClient(userAgent)
    client.headers = newHttpHeaders({"Content-Type": "application/json"})

    let response = client.request(userApi & "/login", httpMethod = HttpPost, body = jsonStr)

    if response.code != Http200:
      resp msgjson(response.body.strip())
       
    resp msgjson(readFile("/flag.txt"))

runForever()

```

In **`main.go`**, the **"Browser not supported"** message appears because the internal only allows certain **User-Agent** values. We can bypass this by simply changing our **User-Agent** to one of the allowed ones. Here the `username`  is directly concatenated into the SQL query, making it vulnerable. If we can bypass the SQL Injection check in the `main.nim,` we should be able to log in using SQL Injection. 

`main.go`

```go
package main

var allowedUserAgents = []string{
	"Mozilla/7.0",
	"ChromeBot/9.5",
	"SafariX/12.2",
	"QuantumBreeze/3.0",
	"EdgeWave/5.1",
	"Dragonfly/8.0",
	"LynxProwler/2.7",
	"NavigatorX/4.3",
	"BraveCat/1.8",
	"OceanaBrowser/6.5",
}

type User struct {
	ID       int
	Username string
	Password string
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	found := false
	for _, userAgent := range allowedUserAgents {
		if strings.Contains(r.Header.Get("User-Agent"), userAgent) {
			found = true
			break
		}
	}

	if !found {
		http.Error(w, "Browser not supported", http.StatusNotAcceptable)
		return
	}

	var user User
	err := json.NewDecoder(r.Body).Decode(&user)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userPassword := user.Password

	row := db.QueryRow("SELECT * FROM users WHERE username='" + user.Username + "';")
	err = row.Scan(&user.ID, &user.Username, &user.Password)
	if err != nil {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(userPassword))
	if err != nil {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "Login successful")
}
```

## ***Exploitation***

Since the user-agent isn’t being filtered, we can use CRLF injection to inject a new POST JSON body. Moreover, the `Nim`  package (version 1.2.4) that we look earlier is vulnerable to CR-LF injection ([CVE-2020-15693](https://nvd.nist.gov/vuln/detail/CVE-2020-15693))

Because `decodeUrl` is used in `main.nim`, we can encode the CR-LF to manipulate the request.  The reason why this would bypass the SQL filter because in the `main.nim`, the server first checks for the original body before processing the `user-agent` header. 

With this, we inject a new JSON body using CRLF, the server ignores the original request and processes our injected payload instead. 

However, we need to ensure that the `Content-Length of the original body matches the injected body` so that the server reads our payload correctly. If the lengths don’t match, the request may be **truncated** or cause an **EOF error**. More details about the [content-length](https://portswigger.net/web-security/request-smuggling).

---
🪡User-Agent: Mozilla/7.0%0D%0A%0D%0A{"username":"' union select 1,'test','$2a$10$QWZjiwShWz6QZMDnjh26Q.T2QVm1TLv5sQ1d7gktCppHDosMRBLlK","password":"test"}

---

Final query

The code uses **bcrypt** to hash the password and compare it against the stored hash in the database.

```sql
SELECT * FROM users WHERE username='' union select 1, 'test', 
'$2a$10$QWZjiwShWz6QZMDnjh26Q.T2QVm1TLv5sQ1d7gktCppHDosMRBLlK'
```

![image.png](/assets/images/gatecrash/image3.png)

## ***I’ve Leanred***

💡Deeper knowledge about request package

💡CRLF injection, content length, and how it can manipulate requests

💡The important of code execution order in request handling