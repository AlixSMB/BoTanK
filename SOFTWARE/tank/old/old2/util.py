import socket
import errno
import httptools
import time
from hashlib import sha1
from base64 import b64encode
import cv2
import threading

#from ctypes import CDLL, Structure, POINTER, c_ubyte, c_uint, c_ulonglong
#CProg = CDLL('./ws_framing.dll')
#CProg.decode_frame.argtypes = [POINTER(c_ubyte)]
#class C_Frame(Structure):
#	_fields_ = [
#		('start', c_ulonglong),
#		('len', c_ulonglong),
#		('fin', c_ubyte),
#		('type', c_ubyte)
#	]
#CProg.decode_frame.restype = C_Frame


def partial(fun, *args1):
	return lambda *args2: fun(*args1, *args2)
def noop(*args):
	pass

# create anonymous objects
Object = lambda **kwargs: type("Object", (), kwargs)()

# from https://stackoverflow.com/questions/43665208/how-to-get-the-latest-frame-from-capture-device-camera-in-opencv
# read always the latest frame
class VideoCapture:
	def __init__(self, *args):
		self.cap = cv2.VideoCapture(*args)
		self.lock = threading.Lock()
		self.t = threading.Thread(target=self._reader)
		self.t.daemon = True
		self.t.start()

	# grab frames as soon as they are available
	def _reader(self):
		while True:
			with self.lock:
				ret = self.cap.grab()
			if not ret:
				break
	
	def release(self) : self.cap.release()
	def get(self, *args):
		return self.cap.get(*args)
	# retrieve latest frame
	def read(self):
		with self.lock:
			ret, frame = self.cap.retrieve()
		return ret, frame

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
	def nodata_elapsed(self): # in s
		return time.perf_counter() - self.lastexch
class TCPServer:
	def __init__(self, port):
		self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
		self.sock.bind(('', port))
		self.sock.listen() 
		self.sock.setblocking(0)
		self.remotes = {}
		
	def connect(self):
		try: 
			remotesock, addr = self.sock.accept()
			#remotesock.setblocking(0)
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
			data = remote.sock.recv(4096, socket.MSG_DONTWAIT)
			remote.lastexch = time.perf_counter()
			return data
		except:
			return None
	def send(self, data, addr):
		try:
			remote = self.remotes[addr]
			sent = remote.sock.sendall(data)
			remote.lastexch = time.perf_counter()
			return True
		except:
			return None
class HttpParserHandler:
	def __init__(self):
		self.parser = httptools.HttpRequestParser(self)
		self.reset()
	
	def reset(self):
		self.complete = False
		self.headers = {}
		self.url = None
		self.method = None
		self.body = bytes()
	
	# httptools callbacks
	def on_url(self, url):
		self.url = url
	def on_message_complete(self):
		self.complete = True
		self.method = self.parser.get_method()
	def on_header(self, name, value):
		self.headers[name] = value 
	def on_body(self, body):
		self.body += body
class WSParser:
	def __init__(self):
		self.reset()
	
	def reset(self):
		self.connected = False
		self.complete = False
		self.msg = bytes()
		self.close = False
		
	def check_upgrade(self, server, addr):
		parser = server.protocols[addr]['http']
		if (b'Connection' in parser.headers and parser.headers[b'Connection'] == b'Upgrade' and
			b'Upgrade' in parser.headers and parser.headers[b'Upgrade'] == b'websocket'):
			
			self.connected = True
			server.sendraw(bytes(
				"HTTP/1.1 101 Switching Protocols\r\n" +
				"Upgrade: websocket\r\n" +
				"Connection: Upgrade\r\n" +
				f"Sec-WebSocket-Accept: { b64encode(hash(parser.headers[b'Sec-WebSocket-Key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11')) }\r\n\r\n"
			,'utf-8'), addr)
			return True
		return False
	def parseframe(self, data):
		frame = decode_frame(data)
		if frame.type == 0x8: # close connection
			self.close = True
		else:
			self.complete = False if frame.fin == 0 else True
			self.msg += data[frame.start:frame.len]
	
class HTTPServer:
	def __init__(self, port, on_close=noop):
		self.con = TCPServer(port)
		self.protocols = {}
		
		self.on_close = on_close
	
	def connect(self):
		addr = self.con.connect()
		if addr is not None : self.protocols[addr] = {'http': HttpParserHandler(), 'ws': WSParser()}
	def close(self, addr):
		del self.protocols[addr]
		self.con.disconnect(addr)
		self.on_close(addr)
	
	def read(self, addr):
		data = self.con.recv(addr)
		protocol = self.protocols[addr]
		
		if data is not None:
			if protocol['ws'].connected : protocol.parseframe(data)
			else: # http
				if not protocol['ws'].check_upgrade(self, addr): 
					self.protocols[addr]['http'].parser.feed_data(data)
					return True
				else : return False
		else:
			return False
	
	def sendraw(self, data, addr):
		sent = self.con.send(data, addr)
		if sent is None : # disconnect
			self.close(addr)
			return False
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
