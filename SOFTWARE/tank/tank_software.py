from util import * # util.py
import positioning # positionin.py

import cv2
import cv2.aruco as aruco
import numpy as np
#from adafruit_motorkit import MotorKit
#kit = MotorKit()


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
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)  # get max. res
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 10000) # of camera
cap.set(cv2.CAP_PROP_FPS, 100)     # high framerate and low exposure time
cap.set(cv2.CAP_PROP_EXPOSURE, -5) # should help minimize motion blur
print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
print(f"Video FPS: {cap.get(cv2.CAP_PROP_FPS)}")
print(f"Video exposure: {cap.get(cv2.CAP_PROP_EXPOSURE)}")

print(f"Local IP addresses: {getLocalIps()}")

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
			if sent is True : self.data['streams'].add(addr)
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
		8080, 3, localcam_onmsg,
		on_close=lambda panel, addr: panel.data['streams'].discard(addr), 
		data={'streams': set()}
	),
	# communication server (HTTP REST API)
	'coms': CtrlPanelServer(
		8081, 10, coms_onmsg
	)
}
camserv = ctrlpanel["localcamera"]

def update_data(self, val):
	self.val = val
def update_move_vel(self, vel):
	if not data['move']['auto']['on'].val:
		#kit.motor1.throttle = vel[0]
		#kit.motor2.throttle = vel[1]
		self.val = vel
def toggle_move_auto(self, on):
	if on:
		kit.motor1.throttle = 0
		kit.motor2.throttle = 0
	self.val = on
def toggle_canon_auto(self, on):
	self.val = on
data = {
	'move': {
		'com': { # command
			'pos': Object(val=[0,0], onchange=update_data),
			'dir': Object(val=[0,0], onchange=update_data),
			'vel': Object(val=[0,0], onchange=update_move_vel)
		},
		'real': { # actual value
			'pos': Object(val=[0,0], onchange=update_data),
			'dir': Object(val=[0,0], onchange=update_data),
			'vel': Object(val=[0,0], onchange=update_data)
		},
		'auto': { # automatic mode
			'on': Object(val=False, onchange=toggle_move_auto),
			'target': Object(val=[0,0], onchange=update_data)
		}
	},
	'cannon': {
		'com': {
			'yaw': Object(val=0, onchange=update_data),
			'pitch': Object(val=0, onchange=update_data)
		},
		'real': {
			'yaw': Object(val=0, onchange=update_data),
			'pitch': Object(val=0, onchange=update_data)
		},
		'auto': {'on': Object(val=False, onchange=toggle_canon_auto),}
	}	
};


set_timer('read_imgframe', 1/30)
set_timer('stream_imgframe', 1/10) # 10 fps
set_timer('sockalive', 1) 
set_timer('sockconnect', 1)
while True:
	#global camera_frame, camera_jpegbytes, tankpos, tank_realspeed, tank_targetspeed
	timers_start()
	
	#camera_jpegbytes = httpvideo.getFrameImg()
	#camera_frame = cv2.imdecode( np.frombuffer(camera_jpegbytes, dtype=np.uint8), cv2.IMREAD_COLOR)
	
	# read new camera frame
	if check_timer('read_imgframe'):
		ret, camera_frame = cap.read()
		if not ret: 
			print("Camera error, abort")
			break
		#cv2.imshow('videostream', camera_frame)
	
		# compute tank pos, speed
		
	
	# check for connection requests
	if check_timer('sockconnect'):
		for part in ctrlpanel : ctrlpanel[part].serv.connect()
	
	# check connections are alive
	if check_timer('sockalive'):
		for part in ctrlpanel : ctrlpanel[part].checkdead()
	
	# stream camera
	if check_timer('stream_imgframe'):
		camera_jpegbytes = cv2.imencode('.jpeg', camera_frame)[1].tobytes()
		
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
#	- check regularly that vel data is received if vel is set to something other than 0,0
# 	- optimize code:
#		- for ... in list(...dict...)
#		- use dict for url dispatcher ?
#	- handle timers differently ?
# 	- compile framing with optimization enabled
