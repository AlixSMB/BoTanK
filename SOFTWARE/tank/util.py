import socket
import errno
import time
import cv2
import numpy as np
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

class Timeout:
	def __init__(self, maxelapsed, callback):
		self.maxelapsed = maxelapsed
		self.callback = callback
		self.last = time.perf_counter()
		self.stopped = False
		self.enabled = False
	
	def refresh(self):
		if not self.enabled : return
		
		self.stopped = False
		self.last = time.perf_counter()
	def check(self):
		if self.stopped or not self.enabled : return
		
		if time.perf_counter() - self.last > self.maxelapsed :
			self.stopped = True
			self.callback()
	
	def disable(self):
		self.enabled = False
		return self
	def enable(self):
		if self.enabled : return self # don't re-enable if already enabled
		
		self.enabled = True
		self.refresh()
		return self

# nb_w / nb_h is total number of cells (black or white) in row/column
def getChessBoardCorners(nb_w, nb_h, cell_s):
	# bottom right corners of black and white cells, starts at top left cell, goes right then down
	return [ [cell_s*i, cell_s*j, 0] for j in range(1,nb_h) for i in range(1,nb_w) ]
# returns ids , 4 corners of each marker
def getGridMarkers(nb_w, nb_h, cell_s, cell_m, startId=0):
	ids = []
	corners = []
	
	s = cell_s + cell_m*2 # total square size
	n=startId
	for i in range(nb_w):
		for j in range(nb_h):
			
			ids.append(n) # ids
			n += 1
			
			yt = s*j + cell_m        ; yb = s*j + cell_m+cell_s
			xr = s*i + cell_m+cell_s ; xl = s*i + cell_m
			corners.append([ [xl,yt,0], [xl,yb,0], [xr,yb,0], [xr,yt,0] ]) # top left corner first, CCW order
	
	return [ np.asarray(ids, int), np.asarray(corners, np.float32) ]

# from: https://medium.com/@kennethjiang/calibrate-fisheye-lens-using-opencv-part-2-13990f1b157f
def fisheye_undistort(cam_params, img, balance=1.0, dim2=None, dim3=None):
	DIM = cam_params['dims']
	D = cam_params['D']
	K = cam_params['K']
	
	dim1 = img.shape[:2][::-1]  # dim1 is the dimension of input image to un-distort
	assert dim1[0]/dim1[1] == DIM[0]/DIM[1], "Image to undistort needs to have same aspect ratio as the ones used in calibration"
	
	if not dim2 : dim2 = dim1
	if not dim3 : dim3 = dim1
	scaled_K = K * dim1[0] / DIM[0]  # The values of K is to scale with image dimension.
	scaled_K[2][2] = 1.0  # Except that K[2][2] is always 1.0
	# This is how scaled_K, dim2 and balance are used to determine the final K used to un-distort image. OpenCV document failed to make this clear!
	new_K = cv2.fisheye.estimateNewCameraMatrixForUndistortRectify(scaled_K, D, dim2, np.eye(3), balance=balance)
	map1, map2 = cv2.fisheye.initUndistortRectifyMap(scaled_K, D, np.eye(3), new_K, dim3, cv2.CV_16SC2)
	
	return cv2.remap(img, map1, map2, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

# from https://stackoverflow.com/questions/43665208/how-to-get-the-latest-frame-from-capture-device-camera-in-opencv
# read always the latest frame
'''
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
'''

# Connections with only 1 other device
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
