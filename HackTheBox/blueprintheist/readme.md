---
layout: post
title:  "Blueprint Heist"
date:   2025-03-12 12:32:45 +0100
permalink: /hackthebox/blueprintheist/
---


# HTB - Blueprint Heist
---
> Author: lordrukie
> Published: March 12, 2025
> Description: Amidst the chaos of their digital onslaught, they manage to extract the blueprints by inflitrating the ministry of internal affair's urban planning commission office detailing the rock and soil layout crucial for their underground tunnel schematics.

---

<br>


Nothing is interesting on the index page except for 2 links. When we click on these links, it then sends a post request to `/download` and a PDF file gets downloaded. 

![image.png](/assets/images/blueprintheist/image.png)

![image.png](/assets/images/blueprintheist/image1.png)

When I intercepted the POST request, I noticed it was sending two parameters: a "Token" and a "URL." The Token contains a JWT (JSON Web Token) value, while the URL seems to be fetching data from a `/report/environmental-impact` endpoint on `localhost`. When I tried accessing the `/report/environmental-impact` page directly, it displayed content that looked similar to a PDF file that was downloaded. To understand how this works, let’s dig into the source code.

![image.png](/assets/images/blueprintheist/image2.png)

![image.png](/assets/images/blueprintheist/image3.png)

## ***Objective: Where’s the flag?***

In the docker file, a command `/readflag` is set up by copying a `readflag.c` source file into the container, compiling it into an executable with `gcc`.  This enables the `/readflag` executable. We can retrieve the flag by executing this command.

![image.png](/assets/images/blueprintheist/image4.png)

`Public.js`
There are five routes defined in `public.js`, but we're mainly focused on the `/download` route. 

`Internal.js`

There are two routes defined in `Internal.js`, and both require the `admin` role via the `authMiddleware` function:  `/admin`, `/graphql` . 

![image.png](/assets/images/blueprintheist/image5.png)

![image.png](/assets/images/blueprintheist/image6.png)

### ***JWT Forgery***

Looking throught the `authMiddleware` function, it will get the `token` parameter and decodes it using the `secret` that is stored in the `.env` file. This means we can use the same secret to craft a new token with the `admin` role and gain access to the `/admin` and `/graphql` routes.

```jsx
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=Secr3tP4ssw0rdNoGu35s!
DB_NAME=construction
DB_PORT=3306
secret=Str0ng_K3y_N0_l3ak_pl3ase?
```

![image.png](/assets/images/blueprintheist/image7.png)

![image.png](/assets/images/blueprintheist/image8.png)

Another way to get `secret` token by exploiting SSRF via `wkhtmltopdf` library in route `/download`.  

`/download` 
 The PDF generation is done by `generatePdfFromUrl`, which uses the `wkhtmltopdf` library.

`convertPdf`

```jsx

async function generatePdfFromUrl(url, pdfPath) {
    return new Promise((resolve, reject) => {
        wkhtmltopdf(url, { output: pdfPath }, (err) => {
            if (err) {
                console.log(err)
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

module.exports = { convertPdf };
```

### ***LFI via SSRF (`wkhtmltopdf` )***

After checking in the docker and googling,  `wkhtmltopdf` uses version 0.12.5 and is vulnerable to SSRF. I came across this [blog post](https://www.noob.ninja/2017/11/local-file-read-via-xss-in-dynamically.html) that demonstrates how SSRF can be leveraged to exploit a local file read vulnerability. We can use this to further read the local file. 

```jsx
RUN wget https://github.com/wkhtmltopdf/wkhtmltopdf/releases/download/0.12.5/wkhtmltox_0.12.5-1.buster_amd64.deb && \
    dpkg -i wkhtmltox_0.12.5-1.buster_amd64.deb || true  && \
    rm wkhtmltox_0.12.5-1.buster_amd64.deb
```

![image.png](/assets/images/blueprintheist/image9.png)

Host a php server with a header `<?php header('location:file://'.$_REQUEST['x']); ?>` . 

![image.png](/assets/images/blueprintheist/image10.png)

![image.png](/assets/images/blueprintheist/image11.png)

After successfully crafting the token with the admin role, we can access the `/admin` and `/graphql` routes by setting our URL to `127.0.0.1`, as the `authMiddleware` function includes a `checkInternal` function that allows access from internal addresses.

```jsx
const authMiddleware = (requiredRole) => {
    return (req, res, next) => {
        const token = req.query.token;

        if (!token) {
            return next(generateError(401, "Access denied. Token is required."));
        }

        const role = verifyToken(token);

        if (!role) {
            return next(generateError(401, "Invalid or expired token."));
        }

        if (requiredRole === "admin" && role !== "admin") {
            return next(generateError(401, "Unauthorized."));
        } else if (requiredRole === "admin" && role === "admin") {
            if (!checkInternal(req)) {
                return next(generateError(403, "Only available for internal users!"));
            }
        }

        next();
    };
};
```

`security.js`

```jsx
function checkInternal(req) {
    const address = req.socket.remoteAddress.replace(/^.*:/, '')
    return address === "127.0.0.1"
}
```

![image.png](/assets/images/blueprintheist/image12.png)

When checking the admin, a request is sent to `/GraphQL` with the provided `username`. Based on the `schema.js`, the input passes through the `detectSqli` function. 

`admin.js`

```jsx
document.getElementById('fetchUserForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const token = getToken()

    const username = document.getElementById('username').value;
    fetch(`/graphql?token=${token}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: `{
                getDataByName(name: "${username}") {
                    name
                    department
                    isPresent
                }
            }`
        })
    })
    .then(response => response.json())
```

`schema.js`

```jsx
getDataByName: {
      type: new GraphQLList(UserType),
      args: {
        name: { type: GraphQLString }
      },
      resolve: async(parent, args, { pool }) => {
        let data;
        const connection = await pool.getConnection();
        console.log(args.name)
        if (detectSqli(args.name)) {
          return generateError(400, "Username must only contain letters, numbers, and spaces.")
        }
        try {
            data = await connection.query(`SELECT * FROM users WHERE name like '%${args.name}%'`).then(rows => rows[0]);
        } catch (error) {
            return generateError(500, error)
        } finally {
            connection.release()
        }
        return data;
      }
```

The `detectSqli` function uses a regex to identify potential SQL injection attempts. However, this regex is weak as we can bypass this by using `\u000a` (newline character). 

```jsx
function detectSqli (query) {
    const pattern = /^.*[!#$%^&*()\-_=+{}\[\]\\|;:'\",.<>\/?]/
    return pattern.test(query)
}
```

![image.png](/assets/images/blueprintheist/image13.png)

Since the `/graphql` route is defined using `router.all`, it accepts requests of any method, including `GET`. This allows us to craft a `GET` request with the query as a URL parameter, enabling direct interaction with the database.

Also, in the database file, the `users` tables was created with 4 column and the user `root` was assigned all the privileges, this allow us to read file as well as upload file

```
CREATE TABLE construction.users (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    name TEXT,
    department TEXT,
    isPresent BOOLEAN
);

CREATE USER 'root'@'%' IDENTIFIED BY 'Secr3tP4ssw0rdNoGu35s!'; 
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
```

![image.png](/assets/images/blueprintheist/image14.png)

![image.png](/assets/images/blueprintheist/image15.png)

Before uploading file, let’s check over the `errorController.js`. The `generateError` function will create an Error object with a given HTTP status code, and message. The `renderError` function selects the appropriate error template in the `/views/errors`  folder (Ex: If the error status code is 500 then it will render the `500.ejs`). If a specific template is missing, it defaults to `error.ejs`

```jsx
function generateError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
};

const renderError = (err, req, res) => {
    res.status(err.status);
    const templateDir = __dirname + '/../views/errors';
    const errorTemplate = (err.status >= 400 && err.status < 600) ? err.status : "error"
    let templatePath = path.join(templateDir, `${errorTemplate}.ejs`);

    if (!fs.existsSync(templatePath)) {
        templatePath = path.join(templateDir, `error.ejs`);
    }
    console.log(templatePath)
    res.render(templatePath, { error: err.message }, (renderErr, html) => {
        res.send(html);
    });
};

module.exports = { generateError, renderError }
```

Since there is no `404.ejs` template in the errors folder, we can use both SQL Injection and SSTI to upload a malicious `404.ejs` file. This allows us to achieve Remote Code Execution (RCE). 

[SSTI (Server Side Template Injection) | HackTricks - Boitatech](https://hacktricks.boitatech.com.br/pentesting-web/ssti-server-side-template-injection)

![image.png](/assets/images/blueprintheist/image16.png)

![image.png](/assets/images/blueprintheist/image17.png)

### I’ve Learned:

💡LFI via SSRF (**wkhtmltopdf**)

💡Graphql SQL Injection

💡SSTI in EJS leading to RCE