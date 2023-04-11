let reader = new FileReader();
reader.onloadend = () => document.querySelector('img').src = reader.result;

chrome.sockets.udp.onReceive.addListener( info => {
	console.log(`Message from socket id "${info.socketId}" @${info.remoteAddress}:${info.remotePort}`);
	
	if (reader.readyState != "LOADING") reader.readAsDataURL(new Blob([info.data]));
} );

// Create the Socket
// [!] if the buffer size is too small, onReceive listener won't be called [!]
chrome.sockets.udp.create({bufferSize:4096*8}, sockinfo => {
	sockid = sockinfo.socketId;
	
	chrome.sockets.udp.bind(sockid, "0.0.0.0", 81, res => {
		if (res < 0) {
			console.log("Error binding socket");
			return;
		}
		console.log("Success binding socket");
		
		//chrome.sockets.udp.send(sockid, arrayBuffer,
		//	'127.0.0.1', 1337, function(sendInfo) {
		//	console.log("sent " + sendInfo.bytesSent);
		//});
	});
});
