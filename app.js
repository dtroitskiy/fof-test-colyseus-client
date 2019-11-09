const http = require('http');
const fs = require('fs');
const port = process.env.PORT || 8000;
http.createServer(function(req, res)
{
	let url = '.' + (req.url == '/' ? '/index.html' : req.url);
	console.log('Requested: ' + url);
	fs.readFile(url, function(err, content)
	{
		if (err)
		{
			let message404 = "There is no such page!";
			res.writeHead(404, { 'Content-Type': 'text/html', 'Content-Length': message404.length });
			res.write(message404);
		}
		else
		{
			let contentType = '';
			if (url.indexOf('.js') != -1)
			{
				contentType = 'text/javascript';
			}
			else if (url.indexOf('.wasm') != -1)
			{
				contentType = 'application/wasm';
			}
			else if (url.indexOf('.data') != -1)
			{
				contentType = 'application/octet-stream';
			}
			else
			{
				contentType = 'text/html';
			}
			res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': content.length });
			res.write(content);
		}
		res.end();
	})
}).listen(port);
console.log('Listening to %d', port);
