import socket
import errno
import time
import cv2
import threading


def partial(fun, *args1):
	return lambda *args2: fun(*args1, *args2)
def noop(*args):
	pass

# create anonymous objects
Object = lambda **kwargs: type("Object", (), kwargs)()

def dict_get(dictio, keys):    
    for key in keys:
        dictio = dictio[key]
    return dictio

timers = {}
def set_timer(name, dt): # in s
	timers[name] = [0, dt, True]
def check_timer(name):
	return timers[name][2]
def timers_start():
	newt = time.perf_counter()
	for timer in timers:
		if newt-timers[timer][0] >= timers[timer][1]:
			timers[timer][2] = True
			timers[timer][0] = newt
def timers_end():
	for timer in timers : timers[timer][2] = False


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

# Connections with only 1 other device
class UDP:
	def __init__(self, addr, port):
		self.addr = addr
		self.port = port
		self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		self.sock.bind((addr, port))
		#self.sock.setblocking(0) # non blocking
	
	def send(self, data):
		self.sock.sendto(data, (self.addr, self.port))
	def recv(self, size=4096):
		return self.sock.recv(size, socket.MSG_DONTWAIT)
class TCPServer:
	def __init__(self, addr, port):
		self.addr = addr
		self.port = port
		self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
		self.sock.bind((addr, port))
		self.sock.listen(1) 
		#self.sock.setblocking(0)
		
		self.lastexch = time.perf_counter() # last time data was transmitted
	
	def nodata_elapsed(self): # in s
		return time.perf_counter() - self.lastexch
	
	def connect(self):
		remotesock, addr = self.sock.accept()
		#remotesock.setblocking(0)
		print(f"Remote connection from {addr[0]}:{addr[1]}")
	def disconnect(self):
		print(f"Remote connection from {self.addr}:{self.port} ended")
		self.sock.close()
	
	def recv(self, size=4096):
		try:
			data = self.sock.recv(size, socket.MSG_DONTWAIT)
			self.lastexch = time.perf_counter()
			return data
		except:
			return None
	def send(self, data):
		try:
			sent = self.sock.sendall(data)
			self.lastexch = time.perf_counter()
			return True
		except:
			return False
