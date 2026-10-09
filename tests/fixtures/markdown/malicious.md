# Unsafe Markdown

<script>
alert("xss")
</script>

[Unsafe](javascript:alert(1))

<img src=x onerror="alert(1)">

[Data](data:text/html,<script>alert(2)</script>)

[File](file:///C:/Windows/win.ini)

![Traversal](../../private.png)

<iframe src="https://example.com"></iframe>
