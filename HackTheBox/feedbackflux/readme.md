---
layout: post
title:  "FeedBack Flux"
date:   2025-03-14 12:32:45 +0100
permalink: /hackthebox/feedbackflux/
---


# HTB - FeedBack Flux
---
> Author: Xclow3n
> Published: March 14, 2025
> Description: You're a member of fsociety tasked with infiltrating E Corp's Feedback Flux system. There's a vulnerability hidden deep within their feedback platform, and it's your job to find and exploit it.

---

<br>


The page looks pretty empty, except for a feedback form. After submitting it, the page responds to us with a simple message: **"Feedback submitted!".** Let’s look over the source code.

![image.png](/assets/images/feedbackflux/image.png)

![image.png](/assets/images/feedbackflux/image1.png)

The web application is built with PHP and Laravel, following the MVC design pattern. It has three defined routes:

- **`/`** – Displays the feedback form, handled by the `create` function.
- **`/` (POST)** – Processes form submissions, handled by the `store` function.
- **`/feedback`** – Shows a list of submitted feedback, handled by the `index` function.

It looks like all three routes are handled within the `Feedback` class, meaning the entire logic for feedback submission and display is contained in a single place.

![image.png](/assets/images/feedbackflux/image2.png)

![image.png](/assets/images/feedbackflux/image3.png)

In the `store` function, the input is first validated and assigned to the `$data` variable. After reviewing the libraries the application uses, I noticed that it relies on `typo3\HtmlSanitizer` to sanitize the input.  I then checked the documentation for `typo3/HtmlSanitizer` and found that the code in the GitHub repository matched exactly what was being used in the application. Initially, I thought there was no way they would have vulnerable code in the GitHub repo, so I decided to check the version of `typo3/HtmlSanitizer` being used. 

They also use puperteer as an admin bot and has the localstorage as the flag

```jsx
 
use App\Models\Feedback;
use Illuminate\Http\Request;
use App\Jobs\AdminBot;
use TYPO3\HtmlSanitizer\Behavior;
use TYPO3\HtmlSanitizer\Behavior\NodeInterface;
use TYPO3\HtmlSanitizer\Sanitizer;
use TYPO3\HtmlSanitizer\Visitor\CommonVisitor;
 public function store(Request $request)
    {
        $data = $request->validate([
            'feedback' => ['required', 'string']
        ]);

        $commonAttrs = [
            new Behavior\Attr('id'),
            new Behavior\Attr('class'),
            new Behavior\Attr('data-', Behavior\Attr::NAME_PREFIX),
        ];
        $hrefAttr = (new Behavior\Attr('href'))
            ->addValues(new Behavior\RegExpAttrValue('#^https?://#'));
        
        $behavior = (new Behavior())
            ->withFlags(Behavior::ENCODE_INVALID_TAG | Behavior::ENCODE_INVALID_COMMENT)
            ->withoutNodes(new Behavior\Comment())
            ->withNodes(new Behavior\CdataSection())
            ->withTags(
                (new Behavior\Tag('div', Behavior\Tag::ALLOW_CHILDREN))
                    ->addAttrs(...$commonAttrs),
                (new Behavior\Tag('a', Behavior\Tag::ALLOW_CHILDREN))
                    ->addAttrs(...$commonAttrs)
                    ->addAttrs($hrefAttr->withFlags(Behavior\Attr::MANDATORY)),
                (new Behavior\Tag('br'))
            )
            ->withNodes(
                (new Behavior\NodeHandler(
                    new Behavior\Tag('typo3'),
                    new Behavior\Handler\ClosureHandler(
                        static function (NodeInterface $node, ?DOMNode $domNode): ?DOMNode {
                            return $domNode === null
                                ? null
                                : new DOMText(sprintf('%s says: "%s"',
                                    strtoupper($domNode->nodeName),
                                    $domNode->textContent
                                ));
                        }
                    )
                ))
            );
        
        $visitors = [new CommonVisitor($behavior)];
        $sanitizer = new Sanitizer($behavior, ...$visitors);
        $data['feedback'] = $sanitizer->sanitize($data['feedback']);

        Feedback::create($data);

        AdminBot::dispatch();
        return to_route('feedback.create')->with('message', 'Feedback submitted!');
    }
```

```jsx
public function handle(): void
    {
        $flagPath = '/flag.txt';
        if (!file_exists($flagPath) || !is_readable($flagPath)) {
            Log::error("Flag file not found or unreadable at $flagPath");
            return;
        }

        $flag = trim(file_get_contents($flagPath));
        $browserFactory = new BrowserFactory();
        $domain = '127.0.0.1';

        $browser = $browserFactory->createBrowser([
            "noSandbox" => true,
        ]);

        try {
            $page = $browser->createPage();

            $page->navigate('http://127.0.0.1:8000')->waitForNavigation();

            $page->evaluate(sprintf(
                'localStorage.setItem("flag", "%s"); console.log("Flag stored in localStorage");',
                $flag
            ));
            $page->evaluate('console.log("Flag in localStorage:", localStorage.getItem("flag"));');
            $page->navigate('http://127.0.0.1:8000/feedback')->waitForNavigation();

            usleep(2000000);

        } catch (\Exception $e) {
            Log::error("Error in AdminBot job: " . $e->getMessage());
        } finally {
            $browser->close();
        }
    }
```

The version I was using is vulnerable to `CVE-2023-47125`. After reviewing the patch, I found that the payload was included in the unit tests. I was able to successfully trigger the alert.

```jsx
 {
            "name": "typo3/html-sanitizer",
            "version": "v2.1.3",
            "source": {
                "type": "git",
                "url": "https://github.com/TYPO3/html-sanitizer.git",
                "reference": "a35f220b2336e3f040f91d3de23d19964833643f"
            },
```

![image.png](/assets/images/feedbackflux/image4.png)

After reviewing the patch and with the help of ChatGPT, it seems that the `<?xml >` tag is not processed correctly within the DOM, causing it to bypass the validation mechanism and leading to a potential XSS vulnerability. In line 65 of the patch, a new rule for handling unexpected tags is defined. This rule is later incorporated into the `createBehavior` function at line 82.

For more details :

- [https://vulert.com/vuln-db/bitnami-typo3-106047](https://vulert.com/vuln-db/bitnami-typo3-106047)
- [[SECURITY] Deny processing instructions · TYPO3/html-sanitizer@b8f9071](https://github.com/TYPO3/html-sanitizer/commit/b8f90717251d968c49dc77f8c1e5912e2fbe0dff)
- [NVD - CVE-2023-47125](https://nvd.nist.gov/vuln/detail/CVE-2023-47125)

![image.png](/assets/images/feedbackflux/image5.png)

![image.png](/assets/images/feedbackflux/image6.png)

### I’ve Learned:

💡CVE-2023-47125 (XSS bypass filtering)