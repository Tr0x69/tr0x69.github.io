---
layout: post
title:  "Pumpkin Spice"
date:   2025-03-07 12:32:45 +0100
permalink: /hackthebox/pumpkinspice/
---


# HTB - Pumpkin Spice
---
> Author: leanthedev
> Published: March 7, 2025
> Description: In the realm of cyberspace, a hacker collective known as the "Phantom Pumpkin Patch" has unearthed a sinister Halloween-themed website, guarded by a devious vulnerability. As the moon casts an ominous glow, get ready to exploit this spectral weakness

---




Right from the start, the application only has one page with a single input field where we can enter addresses. After entering, it sent to an endpoint at `/add/address` , and we got the response ‘Address registered’. There’s not much information to go on here, so let’s dig into the source code to figure out what’s happening. 

![image.png](/assets/images/pumpkinspice/image.png)

Since the flag file (`flag.txt`) is being copied into the Docker container, it’s likely stored on the server side. This means the app could have server-side vulnerable. 

The application is built with Flask and includes a total of four routes. Additionally, there's a bot running on localhost that automatically visits the `/addresses` route.

`start_bot()`

```python
def start_bot():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.support.ui import WebDriverWait

    host, port = "localhost", 1337
    HOST = f"http://{host}:{port}"

    options = Options()

    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-infobars")
    options.add_argument("--disable-background-networking")
    options.add_argument("--disable-default-apps")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-sync")
    options.add_argument("--disable-translate")
    options.add_argument("--hide-scrollbars")
    options.add_argument("--metrics-recording-only")
    options.add_argument("--mute-audio")
    options.add_argument("--no-first-run")
    options.add_argument("--dns-prefetch-disable")
    options.add_argument("--safebrowsing-disable-auto-update")
    options.add_argument("--media-cache-size=1")
    options.add_argument("--disk-cache-size=1")
    options.add_argument("--user-agent=HTB/1.0")

    service = Service(executable_path="/usr/bin/chromedriver")
    browser = webdriver.Chrome(service=service, options=options)

    browser.get(f"{HOST}/addresses")
    time.sleep(5)
    browser.quit()

```

`/` 

- Return the `index.html` which is the page that has address input

```python
import string, time, subprocess
from flask import Flask, request, render_template, abort
from threading import Thread

app = Flask(__name__)

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")
```

`/add/address` 

- This route get our `address parameter` that we see in the index page, then append to `addresses` array and start the bot.

```python

addresses = []
@app.route("/add/address", methods=["POST"])
def add_address():
    address = request.form.get("address")
    
    if not address:
        return render_template("index.html", message="No address provided")

    addresses.append(address)
    Thread(target=start_bot,).start()
    return render_template("index.html", message="Address registered")
```

`/addresses` 

- The `/addresses` route checks if our request is from [localhost](http://localhost), If it does, it returns `addresses.html` and passes the `addresses` array. Since the bot is from localhost by default, 
it can access this route and receive the `addresses` array.

<br>

```python

@app.route("/addresses", methods=["GET"])
def all_addresses():
    remote_address = request.remote_addr
    if remote_address != "127.0.0.1" and remote_address != "::1":
        return render_template("index.html", message="Only localhost allowed")

    return render_template("addresses.html", addresses=addresses)
```

- `addresses.html`
- List each item in addresses array

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="author" content="lean">
	<title>🎃 Pumpkin Spice 🎃</title>
</head>
<body>
    <h1>System stats:</h1>
    <p id="stats"></p>
    <h1>Addresses:</h1>
    for address in addresses 
        <p>address|safe </p>
    endfor 
    <script src="/static/js/script.js"></script>
</body>
</html>
```

`/api/stats`

- This final route is interesting to us because it's vulnerable to command injection. Similar to the previous route, it checks if the request comes from localhost. If it does, it accepts a `command` parameter and executes it using `subprocess.check_output` without any sanitization. I attempted to bypass this restriction by adding headers like `X-Forwarded-Host` and `X-Forwarded-For`, but it didn’t work.

<br>

```python
@app.route("/api/stats", methods=["GET"])
def stats():
    remote_address = request.remote_addr
    if remote_address != "127.0.0.1" and remote_address != "::1":
        return render_template("index.html", message="Only localhost allowed")

    command = request.args.get("command")
    if not command:
        return render_template("index.html", message="No command provided")

    results = subprocess.check_output(command, shell=True, universal_newlines=True)
    return results
```

Since we can’t bypass the ***localhost*** check with these headers, we can leverage the bot to visit `/api/stats` as it’s from localhost
In the `/add/address` route, since the `addresses.html` template uses Jinja, and renders the `addresses` array without sanitization, we can inject malicious JavaScript through the address parameter. When the bot visits `addresses.html`, the injected script is executed, sending a request to `/api/stats` and bypassing the localhost restriction

## ***Exploitation***

- Host the malicious script

![image.png](/assets/images/pumpkinspice/image1.png)

![image.png](/assets/images/pumpkinspice/image2.png)

- The script is invoked and sent result to webhook

![image.png](/assets/images/pumpkinspice/image3.png)

![image.png](/assets/images/pumpkinspice/image4.png)

![image.png](/assets/images/pumpkinspice/image5.png)

## I’ve Learned:

💡XSS via jinja template

💡Bypassing access control by using bot