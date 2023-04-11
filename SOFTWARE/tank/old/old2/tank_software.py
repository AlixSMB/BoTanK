from util import * # util.py
from positioning import getBoardTransform # positioning.py

import cv2
import numpy as np
#from adafruit_motorkit import MotorKit
#kit = MotorKit()
import math
import time


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

# receive camera feed
#httpvideo = HTTPVideoStream('192.168.1.173', '8080', '/video/mjpeg')
camW = 1280
camH = 720
cam_sendS = 0.2
cam_sendW = round(cam_sendS*camW)
cam_sendH = round(cam_sendS*camH)
GST_STRING = \
	'nvarguscamerasrc ! '\
	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
	'nvvidconv ! '\
	'video/x-raw, width=(int){width}, height=(int){height}, format=(string)BGRx ! '\
	'videoconvert ! '\
	'video/x-raw, format=(string)BGR ! '\
	'appsink'.format(
			width=camW,
			height=camH,
			fps=60,
			capture_width=camW,
			capture_height=camH
	)
#cap = VideoCapture(GST_STRING, cv2.CAP_GSTREAMER) # from util.py [!]
cap = VideoCapture(0)

#cap.set(cv2.CAP_PROP_EXPOSURE, 1) # should help minimize motion blur
print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
print(f"Video FPS: {cap.get(cv2.CAP_PROP_FPS)}")
#print(f"Video exposure: {cap.get(cv2.CAP_PROP_EXPOSURE)}")

#print(f"Local IP addresses: {getLocalIps()}")

def httpserv_sendvec2d(serv, addr, vec):
	serv.sendraw(http_txtresp(
		200, 'OK',
		bytes(f'{str(vec[0])};{str(vec[1])}', 'utf-8')
	), addr)
def httpserv_recvvec2d(serv, addr):
	try:
		x, y = serv.protocols[addr]['http'].body.decode('utf-8').split(';')
	except:
		serv.sendraw(http_empty(400, 'BAD VALUES'), addr)
		return None
	else:
		serv.sendraw(http_empty(204, 'OK'),  addr)
		return [float(x), float(y)]

def localcam_onmsg(self, addr):
	if self.serv.read(addr): # we parsed the full request
		parser = self.serv.protocols[addr]['http']
		if not parser.complete : return
		
		if parser.url.find(b'/video/mjpeg') == 0 and parser.method == b'GET':
			sent = self.serv.sendraw(bytes(
				'HTTP/1.1 200 OK\r\n' +
				'Cache-Control: no-cache\r\n' +
				'Content-Type: multipart/x-mixed-replace; boundary=frame\r\n\r\n'
			, 'utf-8'), addr)
			if sent : self.data['streams'].add(addr)
		else:
			self.serv.sendraw(http_empty(400, 'BAD REQUEST'), addr)
		
		parser.reset()
def coms_onmsg(self, addr):
	if self.serv.read(addr): 
		protocol = self.serv.protocols[addr]
		
		if protocol['ws'].connected: # WS
			parser = protocol['ws']
			if not parser.complete : return
			
			# do something here...
			
		else: # HTTP
			parser = protocol['http']
			if not parser.complete : return
			
			path = [part.decode('utf-8') for part in parser.url.split(b'/')[1:]]
			
			if parser.method == b'GET':
				try:
					if path[-1] == 'on':
						self.serv.sendraw(http_txtresp(
							200, 'OK', bytes('1' if data[path[0]][path[1]]['on'].val else '0', 'utf-8')
						), addr)
					else:
						httpserv_sendvec2d(self.serv, addr, data[path[0]][path[1]][path[2]].val)
				except:
					self.serv.sendraw(http_empty(400, 'BAD REQUEST'), addr)
			
			elif parser.method == b'PUT':
				try:
					if path[-1] == 'on':
						data[path[0]][path[1]]['on'].onchange(True)
						self.serv.sendraw(http_empty(204, 'OK'), addr)
					elif path[-1] == 'off':
						data[path[0]][path[1]]['on'].onchange(False)
						self.serv.sendraw(http_empty(204, 'OK'), addr)
					else:
						res = httpserv_recvvec2d(self.serv, addr)
						if res is not None : data[path[0]][path[1]][path[2]].onchange(res)
				except:
					self.serv.sendraw(http_empty(400, 'BAD REQUEST'), addr)
				
			elif parser.method == b'OPTIONS': 
				self.serv.sendraw(bytes('HTTP/1.1 204 OK\r\nAccess-Control-Allow-Methods: OPTIONS, GET, PUT\r\nAccess-Control-Allow-Origin: *\r\n\r\n', 'utf-8'), addr)
			
			else : self.serv.sendraw(http_empty(400, 'BAD REQUEST'), addr)
			
		parser.reset()
ctrlpanel = { 
	# local cam mjpeg streaming server
	'localcamera': CtrlPanelServer(
		81, 3, localcam_onmsg,
		on_close=lambda panel, addr: panel.data['streams'].discard(addr), 
		data={'streams': set()}
	),
	# communication server (HTTP REST API)
	'coms': CtrlPanelServer(
		82, 10, coms_onmsg
	)
}
camserv = ctrlpanel["localcamera"]

# update data from coms channel (remote)
def update_data(self, val):
	self.val = val
def update_move_vel(self, vel):
	if not data['move']['auto']['on'].val:
		set_move_vel(vel)
		self.val = vel
def toggle_move_auto(self, on):
	kit.motor1.throttle = 0
	kit.motor2.throttle = 0
	self.val = on
def toggle_canon_auto(self, on):
	self.val = on
# update real data
def set_move_vel(vel):
	print(vel)
	vel[1] *= -1
	data['move']['real']['vel'].val = vel
	kit.motor1.throttle = 0.9 if vel[0] > 0.9 else (-0.9 if vel[0] < -0.9 else vel[0]) 
	kit.motor2.throttle = 0.9 if vel[1] > 0.9 else (-0.9 if vel[1] < -0.9 else vel[1])
data = {
	'move': {
		'com': { # command
			'pos': Object(val=[0,0], onchange=update_data),
			'dir': Object(val=[0,0], onchange=update_data),
			'vel': Object(val=[0,0], onchange=update_move_vel)
		},
		'real': { # actual value
			'pos': Object(val=[0,0]),
			'dir': Object(val=[0,0]),
			'vel': Object(val=[0,0])
		},
		'auto': { # automatic mode
			'on': Object(val=False, onchange=toggle_move_auto),
			'target': Object(val=[0,0], onchange=update_data),
			'speed': Object(val=0.5, onchange=update_data) 
		}
	},
	'cannon': {
		'com': {
			'yaw': Object(val=0, onchange=update_data),
			'pitch': Object(val=0, onchange=update_data)
		},
		'real': {
			'yaw': Object(val=0),
			'pitch': Object(val=0)
		},
		'auto': {'on': Object(val=False, onchange=toggle_canon_auto),}
	}	
};

def auto_move():
	target = data['move']['auto']['target'].val
	pos = data['move']['real']['pos'].val
	tankdir = data['move']['real']['dir'].val
	speed = data['move']['auto']['speed'].val
	
	dirTarget = [ target[0]-pos[0], target[1]-pos[1] ]
	dirTargetNorm = math.sqrt(dirTarget[0]**2 + dirTarget[1]**2)
	dirTarget[0] /= dirTargetNorm
	dirTarget[1] /= dirTargetNorm
	# tankdir is already normalized
	
	angle = math.pi/2 - math.acos(tankdir[0]*dirTarget[0] + tankdir[1]*dirTarget[1])
	vel = [math.cos(angle), math.sin(angle)]
	
	if angle >= -math.pi/2 and angle <= math.pi/2 : set_move_vel([speed, vel[1]*speed])
	else                                          : set_move_vel([vel[1]*speed, dist*speed])
	

set_timer('read_imgframe', 1/30)
set_timer('stream_imgframe', 1/10) # 10 fps
set_timer('sockalive', 1) 
set_timer('sockconnect', 1)
while True:
	timers_start()
	
	# read new camera frame
	if check_timer('read_imgframe'):
		#camera_jpegbytes = httpvideo.getFrameImg()
		#camera_frame = cv2.imdecode( np.frombuffer(camera_jpegbytes, dtype=np.uint8), cv2.IMREAD_COLOR)
		ret, camera_frame = cap.read()
		if not ret: 
			print("Camera error, quitting...")
			cap.release()
			break
	#cv2.imshow('videostream', camera_frame)
	
	# compute tank pos, speed
	transfo = getBoardTransform(camera_frame)
	if transfo is not None:
		data['move']['real']['pos'].val = transfo[0]
		data['move']['real']['dir'].val = transfo[1]
		
		if data['move']['auto']['on'].val : auto_move()
	
	# check for connection requests
	if check_timer('sockconnect'):
		for part in ctrlpanel : ctrlpanel[part].serv.connect()
	
	# check connections are alive
	if check_timer('sockalive'):
		for part in ctrlpanel : ctrlpanel[part].checkdead()
	
	# stream camera
	if check_timer('stream_imgframe'):
		camera_jpegbytes = cv2.imencode('.jpeg', cv2.resize(camera_frame, (cam_sendW,cam_sendH)))[1].tobytes()
		
		for addr in list(camserv.data['streams']):
			camserv.serv.sendraw(
				bytes(
					"--frame\r\n" +
					"Content-Type: image/jpeg\r\n" +
					"Content-Length: " + str(len(camera_jpegbytes)) + "\r\n\r\n",
				'utf-8') +
				camera_jpegbytes +
				bytes("\r\n",'utf-8')
			, addr)
	
	# handle received messages
	for part in ctrlpanel:
		for addr in list(ctrlpanel[part].serv.con.remotes) : ctrlpanel[part].on_msg(ctrlpanel[part], addr)
	
	
	if cv2.waitKey(1) == ord('q') : break
	timers_end()


# TODO:

#	- Ajouter 
#	- Ajouter code obstacles (obstacles via camera + ajout manuel via interface)

# 	- sockets: use threads with blocking mode ?
#	- stream video using webrtc ?
#	- stream video using different process ?
#	- check regularly that vel data is received if vel is set to something other than 0,0
# 	- optimize code:
#		- for ... in list(...dict...)
#		- use dict for url dispatcher ?
#	- handle timers differently ?
