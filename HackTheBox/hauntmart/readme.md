---
layout: post
title:  "Haunt Mart"
date:   2025-03-08 12:32:45 +0100
permalink: /hackthebox/hauntmart/
---


# HTB - Haunt Mart
---
> Author: Xclow3n
> Published: March 8, 2025
> Description: HauntMart, a beloved Halloween webstore, has fallen victim to a curse, bringing its products to life. You must explore its ghostly webpages, and break the enchantment before Halloween night. Can you save Spooky Surprises from its supernatural woes?.

---



There are 4 pages total : Register, Login, Index, and Product page

`Register`

![image.png](/assets/images/hauntmart/image.png)

`Login`

![image.png](/assets/images/hauntmart/image1.png)

After signing up and logging in, the app redirects us to the index page.  

`Index`

![image.png](/assets/images/hauntmart/image2.png)

![image.png](/assets/images/hauntmart/image3.png)

The only thing that stands out is the product page—it lets us enter a URL, which is worth noting. After submitting the form, it sends a request to the `/api/product` endpoint and responds with the following message. There’s also a JWT attached, let’s dig into the source code to understand. 

![image.png](/assets/images/hauntmart/image4.png)

![image.png](/assets/images/hauntmart/image5.png)

## ***Objective:***

Take over admin account or escalate privileges to an admin role to retrieve the flag

`Index.html`

```python
</button>
			<div class="collapse navbar-collapse" id="navbarColor03">
				<ul class="navbar-nav ms-auto">
                            if user['role'] == 'admin'
                                return flag
					<li class="nav-item">
						<a class="nav-link active" href="/home">Home
						</a>
					</li>
```

The application is built in Python using Flask. There are 5 web routes and 4 api routes. We only focus on some  `API`  routes since they handle the core logic of the web app 

Even though the `register` and `login` APIs interact with database, but they use prepared statements, and the jwt is created with random key so there’s not much we can do to

```python
generate = lambda x: os.urandom(x).hex()
key = generate(50)
```

There are 2 routes that able to help us get the flag. The `/addAdmin`  get the `username` parameter and grant the `admin` privileges to a user, however it only allows requests from localhost

`API`

```python
@api.route('/addAdmin', methods=['GET'])
@isFromLocalhost
def addAdmin():
    username = request.args.get('username')
    
    if not username:
        return response('Invalid username'), 400
    
    result = makeUserAdmin(username)

    if result:
        return response('User updated!')
    return response('Invalid username'), 400
    
    
    
  def isFromLocalhost(func):
  @wraps(func)
  def check_ip(*args, **kwargs):
      if request.remote_addr != "127.0.0.1":
          return abort(403)
      return func(*args, **kwargs)

  return check_ip
```

The `/product` endpoint requires four parameters and uses the URL we provide as input to call the `downloadManual` function

```python

@api.route('/product', methods=['POST'])
@isAuthenticated
def sellProduct(user):
    if not request.is_json:
        return response('Invalid JSON!'), 400

    data = request.get_json()
    name = data.get('name', '')
    price = data.get('price', '')
    description = data.get('description', '')
    manualUrl = data.get('manual', '')

    if not name or not price or not description or not manualUrl:
        return response('All fields are required!'), 401

    manualPath = downloadManual(manualUrl)
    if (manualPath):
        addProduct(name, description, price)
        return response('Product submitted! Our mods will review your request')
    return response('Invalid Manual URL!'), 400

```

`downLoadManual` 

This function pass our url to `isSafeUrl` function and check if the URL contains  any strings in `blocked_host` array. If true, it extracts the filename from the URL by splitting the URL string and taking the last part after `/` .  It then send a get request to fetch file content  and write to  a new file to `/opt/manualFiles/{local_filename}`  where `{local_filename}`  is the name of the file extracted from the URL

```python
def downloadManual(url):
    safeUrl = isSafeUrl(url)
    if safeUrl:
        try:
            local_filename = url.split("/")[-1]
            r = requests.get(url)
            
            with open(f"/opt/manualFiles/{local_filename}", "wb") as f:
                for chunk in r.iter_content(chunk_size=1024):
                    if chunk:
                        f.write(chunk)
            return True
        except:
            return False
    
    return False
    
    
blocked_host = ["127.0.0.1", "localhost", "0.0.0.0"]
def isSafeUrl(url):
    for hosts in blocked_host:
        if hosts in url:
            return False
    
    return True
```

## ***Exploitation***

In the `downloadManual` function, the application sends a request to the provided URL. Since the `/addAdmin` route is a GET request, we can exploit this by providing a URL that targets the `/addAdmin` endpoint, making our user an admin. Additionally, the `isSafeUrl` function is not safe because it only checks for hardcoded hosts, which can be easily bypassed by using a URL like `LoCalHost`.

![image.png](/assets/images/hauntmart/image6.png)

![image.png](/assets/images/hauntmart/image7.png)

I’ve Learned: 

💡SSRF: Server Side Forgery Request