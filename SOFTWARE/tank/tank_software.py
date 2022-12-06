from util import * # util.py

import cv2
import cv2.aruco as aruco
import numpy as np

import pickle

#CAMERADATA_FILENAME = "camera_calibration_params_1"
#print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
#with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)


class CtrlPanelServer:
	def __init__(self, port, dietimeout, on_msg, on_close=noop, data=None):
		self.serv = HTTPServer(port, partial(on_close, self))
		self.dietimeout = dietimeout
		self.data = data
		self.on_msg = on_msg
	
	def checkdead(self):
		for addr in list(self.serv.con.remotes): # list(...) because we can't modify the dict size and iterate it at the same time
			if self.serv.con.remotes[addr].nodata_elapsed() >= self.dietimeout:
				self.serv.close(addr)

timers = {}
def set_timer(name, dt):
	timers[name] = [0, dt, False]
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

# receive camera feed
#httpvideo = HTTPVideoStream('10.7.177.245', '8080', '/video/mjpeg')
vid = cv2.VideoCapture(0)

print(f"Local IP addresses: {getLocalIps()}")

def httpserv_sendvec2d(serv, addr, vec):
	serv.sendraw(http_txtresp(
		200, 'OK',
		bytes(f'{str(vec[0])};{str(vec[1])}', 'utf-8')
	), addr)
def httpserv_recvvec2d(serv, addr):
	try:
		x, y = serv.parsers[addr].body.decode('utf-8').split(';')
	except:
		serv.sendraw(http_empty(400, 'BAD VALUES'), addr)
		return None
	else:
		serv.sendraw(http_empty(204, 'OK'),  addr)
		return [float(x), float(y)]

def localcam_onmsg(self, addr):
	if self.serv.readfull(addr): # we parsed the full request
		parser = self.serv.parsers[addr]
		if parser.url == b'/video/mjpeg' and parser.method == b'GET':
			sent = self.serv.sendraw(bytes(
				'HTTP/1.1 200 OK\r\n' +
				'Cache-Control: no-cache\r\n' +
				'Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n'
			, 'utf-8'), addr)
			if sent is True:
				self.data['streams'].add(addr)
				set_timer('localcamfps', 1/20)
		else:
			self.serv.sendraw(bytes(
				'HTTP/1.1 400 BAD REQUEST\r\n\r\n'
			, 'utf-8'), addr)
	
	if addr in self.data['streams'] and check_timer('localcamfps'):
		self.serv.sendraw(
			bytes(
				"--frame\r\n" +
				"Content-Type: image/jpeg\r\n" +
				"Content-Length: " + str(len(camera_jpegbytes)) + "\r\n\r\n",
			'utf-8') +
			camera_jpegbytes +
			bytes("\r\n",'utf-8')
		, addr)
def coms_onmsg(self, addr):
	if self.serv.readfull(addr): # we parsed the full request
		parser = self.serv.parsers[addr]
		path = [part.decode('utf-8') for part in parser.url.split(b'/')[1:]]
		
		if parser.method == b'GET':
			
			try:
				if path[-1] == 'on':
					self.serv.sendraw(http_txtresp(
						200, 'OK', bytes('1' if data[path[0]][path[1]]['on'] else '0', 'utf-8')
					), addr)
				else:
					httpserv_sendvec2d(self.serv, addr, data[path[0]][path[1]][path[2]])
			except:
				self.serv.sendraw(http_empty(400, 'BAD REQUEST'), addr)
		
		elif parser.method == b'PUT':
			
			try:
				if path[-1] == 'on':
					data[path[0]][path[1]]['on'] = True
					self.serv.sendraw(http_empty(204, 'OK'), addr)
				elif path[-1] == 'off':
					data[path[0]][path[1]]['on'] = False
					self.serv.sendraw(http_empty(204, 'OK'), addr)
				else:
					res = httpserv_recvvec2d(self.serv, addr)
					if res is not None: data[path[0]][path[1]][path[2]] = res
			except:
				self.serv.sendraw(http_empty(400, 'BAD REQUEST'), addr)
			
		elif parser.method == b'OPTIONS': 
			self.serv.sendraw(bytes('HTTP/1.1 204 OK\r\nAccess-Control-Allow-Methods: OPTIONS, GET, PUT\r\nAccess-Control-Allow-Origin: *\r\n\r\n', 'utf-8'), addr)
		
		else : self.serv.sendraw(http_empty(400, 'BAD REQUEST'), addr)
ctrlpanel = { 
	# local cam mjpeg streaming server
	'localcamera': CtrlPanelServer(
		8080, 3, localcam_onmsg,
		on_close=lambda panel, addr: panel.data['streams'].discard(addr), 
		data={'streams': set()}
	),
	# communication server (HTTP REST API)
	'coms': CtrlPanelServer(
		8081, 10, coms_onmsg
	)
}

data = {
	'move': {
		'com': { # command
			'pos': [0, 0],
			'dir': [0, 0],
			'vel': [0, 0]
		},
		'real': { # actual value
			'pos': [0, 0],
			'dir': [0, 0],
			'vel': [0, 0]
		},
		'auto': { # automatic mode
			'on': False,
			'target': [0, 0]
		}
	},
	'cannon': {
		'com': {
			'yaw': 0,
			'pitch': 0
		},
		'real': {
			'yaw': 0,
			'pitch': 0
		},
		'auto': {'on': False}
	}	
};

set_timer('sockalive', 0.5) # might be unnecessary, but may help performance
#set_timer('sockconnect', 0.1)
while True:
	global camera_frame, camera_jpegbytes, tankpos, tank_realspeed, tank_targetspeed
	timers_start()
	
	#camera_jpegbytes = httpvideo.getFrameImg()
	#camera_frame = cv2.imdecode( np.frombuffer(camera_jpegbytes, dtype=np.uint8), cv2.IMREAD_COLOR)
	_, camera_frame = vid.read()
	camera_jpegbytes = cv2.imencode('.jpeg', camera_frame)[1].tobytes()
	#cv2.imshow('videostream', camera_frame)
	
	# compute tank pos, speed
	
	
	# listen for http connections
	#if check_timer('sockconnect'):
	for part in ctrlpanel : ctrlpanel[part].serv.connect()
	# check connections
	if check_timer('sockalive'):
		for part in ctrlpanel : ctrlpanel[part].checkdead()
	# handle received messages
	for part in ctrlpanel:
		for addr in list(ctrlpanel[part].serv.con.remotes) : ctrlpanel[part].on_msg( ctrlpanel[part], addr )
	
	if cv2.waitKey(1) == ord('q') : break
	timers_end()


# TODO:
# 	- optimize code:
#		- for ... in list(...dict...)
#		- use dict for url dispatcher ?
