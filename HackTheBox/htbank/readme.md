---
layout: post
title:  "HTBank"
date:   2025-03-04 12:32:45 +0100
permalink: /hackthebox/htbank/
---


# HTB - HTBank
---
> Author: DRAL3N
> Published: March 4, 2025
> Description: A notorious bank has recently opened its doors, claiming to house the wealth of the entire world. Can you reclaim what is rightfully yours? Here's a wizard's tip: the bank only permits withdrawals of 1337 units of currency at a time. Are you up for the challenge?

---


![image.png](/assets/images/htbank/image.png)

![image.png](/assets/images/htbank/image3.png)

![image.png](/assets/images/htbank/image2.png)

Looking through the application, there’s just one main function: `withdraw money`. There’s also an `Add Money`  button that does nothing.  As we are having 0 as balance , we can’t do much on this page. Let’s look into the source code to see what’s really going on.

Since our goal is to get the flag, the first step is figuring out where it’s stored and how it gets set. Looking through the `entrypoint.sh` file, we can see that the flag is inserted into the `flag` table with the following SQL statement:

```php
INSERT INTO web_htbank.flag(flag, show_flag) VALUES('HTB{FAKE_FLAG_FOR_TESTING}', 0);
```

The `show_flag`  value is set to 0, which likely prevents it from being displayed. Our objective here is to find a way to change the `show_flag` to 1.

The application is built using Python (Flask + Blueprints) for the frontend and PHP for the backend. Authentication is handled using JWT tokens, but since the secret_key is randomly generated, it’s unlikely that we can manipulate it. 

```php
generate = lambda x: os.urandom(x).hex()
key = generate(50)
def createJWT(username):
    token_expiration = datetime.datetime.utcnow() + datetime.timedelta(minutes=360)
    
    encoded = jwt.encode(
        {
            'username': username,
            'exp': token_expiration
        },
        key,
        algorithm='HS256'
    )

    return encoded

def verifyJWT(token):
    try:
        token_decode = jwt.decode(
            token,
            key,
            algorithms='HS256'
        )

        return token_decode
    except:
        return abort(401, 'Invalid token!')
```

There’s also one more interested feature that we should focus more which is the `Withdraw` feature.  

```python
@api.route('/withdraw', methods=['POST'])
@isAuthenticated
def withdraw(decoded_token):
    body = request.get_data()
    amount = request.form.get('amount', '')
    account = request.form.get('account', '')
    
    if not amount or not account:
        return response('All fields are required!'), 401
    
    user = getUser(decoded_token.get('username'))

    try:
        if (int(user[0].get('balance')) < int(amount) or int(amount) < 0 ):
            return response('Not enough credits!'), 400

        res = requests.post(f"http://{current_app.config.get('PHP_HOST')}/api/withdraw", 
            headers={"content-type": request.headers.get("content-type")}, data=body)
        
        jsonRes = res.json()

        return response(jsonRes['message'])
    except:
        return response('Only accept number!'), 500
```

```php
class WithdrawController extends Controller
{
    public function __construct()
    {
        parent::__construct();
    }

    public function index($router)
    {
        $amount = $_POST['amount'];
        $account = $_POST['account'];

        if ($amount == 1337) {
            $this->database->query('UPDATE flag set show_flag=1');

            return $router->jsonify([
                'message' => 'OK'
            ]);
        }

        return $router->jsonify([
            'message' => 'We don\'t accept that amount'
        ]);
    }

}
```

## ***Understanding the Withdraw Logic:***

1. Flask (Python) Frontend Validation
    - The Flask route `/withdraw` first checks if the amount and account fields are provided.
    - It then verifies if the user’s balance is less than the amount or less than 0.
    - If the check passes, it forwards the entire HTTP request to the PHP backend.
2. PHP Backend Processing
    - The PHP controller receives the request and extracts the `amount`and `account`.
    - If `amount == 1337`, the application updates the flag table (`show_flag = 1`), making the flag retrievable.

## ***Bypassing the Validation***

Looking at the Flask validation, there’s no **strict amount validation**, meaning we can **bypass the first condition** by setting `amount=0`. Additionally, neither the frontend nor backend validates the **account field**, allowing us to set any value.

## ***Exploiting Parameter Pollution***

Here, we can exploit this by adding another `amount`  parameter with the value of 1337 to achive our goal. The reason we do this because when we send with 2 same parameters, the Flask uses the first occurrence of a parameter, then PHP process the last occurrence of a parameter, making Flask reads `amount=0`  first (bypass the balance check), PHP processes the last `amount=1337` , triggering the flag update. 

![image.png](/assets/images/htbank/image3.png)

![image.png](/assets/images/htbank/image4.png)

## I’ve Learned:

💡Parameter Pollution: Different languages/frameworks may handle duplicate parameters differently. [https://stackoverflow.com/questions/46412312/flask-only-returning-a-single-argument-when-parsing-get-request](https://stackoverflow.com/questions/46412312/flask-only-returning-a-single-argument-when-parsing-get-request)

💡Flask (Python): Retrieves first parameter when handling with duplicates parameters.