import socket
import httptools
import time


def partial(fun, *args1):
	return lambda *args2: fun(*args1, *args2)
def noop(*args):
	pass

# create anonymous objects
Object = lambda **kwargs: type("Object", (), kwargs)()

def getLocalIps():
	return socket.gethostbyname_ex(socket.gethostname())[-1]

class HTTPVideoStream:	
	def __init__(self, addr, port, path):		
		self.data = bytes()
		print(f"Connecting to \"{addr}:{port}{path}\" video stream...")
		self.sock = socket.create_connection((addr, port))
		self.sock.sendall(bytes( 'GET /video/mjpeg HTTP/1.1\r\n\r\n', 'utf-8' ))
		print(f"Connected to \"{addr}:{port}{path}\" video stream")

	def getFrameImg(self):
		while True:
			self.data += self.sock.recv(1024)	
			# we should use the boundary marker instead but whatever...		
			jpegstart = self.data.find( b'\xff\xd8' ) # start of jpeg image data
			jpegend = self.data.find( b'\xff\xd9' ) # end of jpeg image data
			if jpegstart != -1 and jpegend != -1:
				frame = self.data[jpegstart : jpegend+2]
				self.data = self.data[jpegend+2 :]
				return frame

class SockInfo:
	def __init__(self, sock, addr):
		self.sock = sock
		self.addr = addr
		self.lastexch = time.perf_counter() # last time data was transmitted
	def nodata_elapsed(self):
		return time.perf_counter() - self.lastexch
class TCPServer:
	def __init__(self, port):
		self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
		self.sock.bind(('', port))
		self.sock.listen() # only connect with control panel
		self.sock.setblocking(0)
		self.remotes = {}
		
	def connect(self):
		try: 
			remotesock, addr = self.sock.accept()
			remotesock.setblocking(0)
			print(f"Remote connection from {addr[0]}:{addr[1]}")
			self.remotes[addr] = SockInfo(remotesock, addr)
			return addr
		except:
			return None
	def disconnect(self, addr):
		print(f"Remote connection from {addr[0]}:{addr[1]} ended")
		self.remotes[addr].sock.close()
		del self.remotes[addr]
	
	def recv(self, addr):
		try:
			remote = self.remotes[addr]
			data = remote.sock.recv(4096)
			remote.lastexch = time.perf_counter()
			return data
		except:
			return None
	def send(self, data, addr):
		try:
			remote = self.remotes[addr]
			remote.sock.sendall(data)
			remote.lastexch = time.perf_counter()
			return True
		except socket.error: # socket disconnected
			return None
		return False
class HttpParserHandler:
	def __init__(self):
		self.parser = httptools.HttpRequestParser(self)
		self.reset()
	
	def reset(self):
		self.complete = False
		self.headers = {}
		self.url = None
		self.method = None
		self.body = None
	
	# httptools callbacks
	def on_url(self, url):
		self.url = url
	def on_message_complete(self):
		self.complete = True
		self.method = self.parser.get_method()
	def on_header(self, name, value):
		self.headers[name] = value 
	def on_body(self, body):
		self.body = body
class HTTPServer:
	def __init__(self, port, on_close=noop):
		self.con = TCPServer(port)
		self.parsers = {}
		
		self.on_close = on_close
	
	def connect(self):
		addr = self.con.connect()
		if addr is not None : self.parsers[addr] = HttpParserHandler()
	def close(self, addr):
		del self.parsers[addr]
		self.con.disconnect(addr)
		self.on_close(addr)
	
	def read(self, addr):
		data = self.con.recv(addr)
		if data is not None:
			self.parsers[addr].parser.feed_data(data)
			return True
		else:
			return False
	def readfull(self, addr):
		return self.read(addr) and self.parsers[addr].complete
	
	def sendraw(self, data, addr):
		sent = self.con.send(data, addr)
		if sent is None: # disconnect
			self.close(addr)
			return None
		else : return sent


def http_empty(code, status):
	return bytes(f'HTTP/1.1 {code} {status}\r\nAccess-Control-Allow-Origin: *\r\n\r\n', 'utf-8')
def http_txtresp(code, status, bindata):
	return bytes(
		f'HTTP/1.1 {code} {status}\r\n' +
		'Content-Type: text/plain; charset=utf-8\r\n' +
		f'Content-Length: {len(bindata)}\r\n' +
		'Access-Control-Allow-Origin: *\r\n\r\n'
	, 'utf-8') + bindata
