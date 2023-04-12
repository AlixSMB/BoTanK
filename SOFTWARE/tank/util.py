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
i=0
class UDP:
	def __init__(self, addr, port_in=None, port_out=None):
		self.addr = addr
		self.port_in = port_in
		self.port_out = port_out
		self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
		if port_in is not None : self.sock.bind(('0.0.0.0', port_in))
		self.sock.setblocking(0) # non blocking
	
	def send(self, data):
		total = 0
		sz = len(data)
		while total < sz : total += self.sock.sendto(data[total:], (self.addr, self.port_out))
	def recv(self, size=4096):
		try:
			return self.sock.recv(size)
		except:
			return None	
class TCPServer:
	def __init__(self, addr, port, deadtimeout=3):
		self.addr = addr
		self.port = port
		self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
		self.sock.bind(('0.0.0.0', port))
		self.sock.listen()
		self.con = False
		self.sock.setblocking(0) # non-blocking for 'accept'
		
		self.lastexch = time.perf_counter() # last time data was transmitted
		self.timeout = deadtimeout
	
	def nodata_elapsed(self): # in s
		return time.perf_counter() - self.lastexch
	def checkdead(self):
		if self.con and self.nodata_elapsed() > self.timeout : self.disconnect()
	
	def connect(self):
		if self.con : return # if socket is already connected do nothing
		
		try:
			remotesock, addr = self.sock.accept()
		except:
			return
		self.con = True
		self.rsock = remotesock
		self.rsock.setblocking(0)
		self.lastexch = time.perf_counter()
		print(f"Remote connection from {addr[0]}:{addr[1]} started")
	def disconnect(self):
		print(f"Remote connection from {self.addr} ended")
		self.rsock.close()
		self.con = False
	
	def recv(self, size=4096):
		if not self.con : return None
		try:
			data = self.rsock.recv(size)
			if (len(data) != 0):
				self.lastexch = time.perf_counter()
				return data
			else : return None
		#except socket.error, err:
		#	if err.errno == errno.ECONNRESET : self.disconnect()
		except:
			return None
	def send(self, data):
		try:
			sent = self.rsock.sendall(data)
			self.lastexch = time.perf_counter()
			return True
		#except socket.error, err:
		#	if err.errno == errno.ECONNRESET : self.disconnect()
		except:
			return False
