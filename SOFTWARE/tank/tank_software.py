# Note for windows CMD: if QuickEdit mode is enabled, clicking the console freezes the script until a keyboard key is pressed... 

from util import * # util.py
from positioning import getBoardTransform, auto_make_board # positioning.py

import cv2
from cv2 import aruco
import numpy as np
from adafruit_motorkit import MotorKit
kit = MotorKit()
#kit = Object(motor1=Object(throttle=0), motor2=Object(throttle=0))
import math
import time
import pickle

# load camera data
CAMERADATA_FILENAME = "jetbot_fisheye_params_1" 
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)

# receive camera feed
camW = 1280
camH = 720
cam_sendS = 0.5
cam_quality = 75
cam_sendW = round(cam_sendS*camW)
cam_sendH = round(cam_sendS*camH)
GST_STRING = \
	'nvarguscamerasrc ! '\
	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
	'nvvidconv ! '\
	'video/x-raw, width=(int){width}, height=(int){height}, format=(string)BGRx ! '\
	'videoconvert ! '\
	'video/x-raw, format=(string)BGR ! '\
	'appsink drop=true'.format(
			width=camW,
			height=camH,
			fps=60,
			capture_width=camW,
			capture_height=camH
	)
#cap = cv2.VideoCapture(GST_STRING, cv2.CAP_GSTREAMER) #VideoCapture(GST_STRING, cv2.CAP_GSTREAMER) # from util.py [!]
cap = cv2.VideoCapture(0)
#cap.set(cv2.CAP_PROP_EXPOSURE, -4) # set to 0.25 auto-adjust
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000);

print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
print(f"Video FPS: {cap.get(cv2.CAP_PROP_FPS)}")
#print(f"Video exposure: {cap.get(cv2.CAP_PROP_EXPOSURE)}")

ADDR_CTRLPANEL = "192.168.43.75"
print(f"Control panel IP set to {ADDR_CTRLPANEL}")
PORT_CAM = 8081
PORT_OPTS = 8082
PORT_COMS_IN = 8082
PORT_COMS_OUT = 8083
HEARTBEAT_MAXTIME = 3
net = Object(
	out_cam = UDP(ADDR_CTRLPANEL, None, PORT_CAM),
	inout_move = UDP(ADDR_CTRLPANEL, PORT_COMS_IN, PORT_COMS_OUT),
	server_opts = TCPServer(ADDR_CTRLPANEL, PORT_OPTS, HEARTBEAT_MAXTIME)
)

aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
current_mobj = None

''' data is like:
 udp: 
 	move,com,vel;0.3201,0.9732
 	cannon,com,yaw;0.326
	...
 tcp request:
	GET
	move,real,pos
	move,real,dir

	SET
	move,auto,on;1
	
	...
 tcp response:
	move,real,pos
	move,real,dir

	OK
	
	...
note: the empty lines serve to delimit different messages 
'''
def recv_setdata(lines):
	for line in lines:
		if line == '' : continue
		path, vals = [el.split(',') for el in line.split(';')]
		
		obj = dict_get(data, path)
		if path[-1] == 'on' : obj.onchange(True if vals[0] == '1' else False)
		else:
			try: # number(s) ?
				for i in range(len(vals)) : vals[i] = float(vals[i])
			except : pass
			if len(vals) == 1 : obj.onchange(vals[0])
			else              : obj.onchange(vals)
def recv_move_data(server):
	msg = server.recv()
	while msg is not None:
	#if msg is not None:
		recv_setdata(msg.decode('ascii').split('\n'))
		msg = server.recv()
def recv_opts_data(server):
	msg = server.recv()
	if msg is None : return
	while msg[-2:] != b'\n\n' : msg += server.recv()
	
	for part in msg.decode('ascii').split('\n\n'):
		if part == '' : continue
		
		lines = part.split('\n')
		
		if lines[0] == 'HEARTBEAT':
			server.send(b'OK\n\n')
		
		elif lines[0] == 'GET':
			res = ''
			for line in lines[1:]:
				if line == '' : continue
				
				path = line.split(',')
				obj = dict_get(data, path)
				
				if path[-1] == 'on' : res += f"{line};{'1' if obj.val else '0'}\n"
				else:
					if isinstance(obj.val, list) : res += f"{line};{ ','.join([str(el) for el in obj.val]) }\n"
					else                         : res += f"{line};{str(obj.val)}\n"
			server.send( (res+'\n').encode('ascii') )
			
		elif lines[0] == 'SET':
			recv_setdata(lines[1:])
			server.send(b'OK\n\n')
		
		elif lines[0] == 'SETMARKERS':
			mids = []
			cornersAll = []
			for line in lines[1:]:
				if line == '' : continue
				mtype, mid, corners = line.split(';;');
				mids.append(int(mid))
				cornersAll.append([ [float(val) for val in corner.split(',')] for corner in corners.split(';') ])
				
			data['markers'][mtype].onchange(mtype, mids, cornersAll)
			server.send(b'OK\n\n')
		
		elif lines[0] == 'DO':
			
			if lines[1] == 'SNAPAUTOBOARD':
				if auto_make_board(cameradata, camera_frame, data['markers']['auto'], data['markers']['auto_s'].val, aruco_dict):
					send_auto_markers()
				server.send(b'OK\n\n')
			
			elif lines[1] == 'RESETAUTOBOARD':
				reset_auto_board()
				server.send(b'OK\n\n')
			
			else :
				console.log(f"Received unknown \"DO\" request \"{lines[0]}\"")
				server.send(b'ERR\n\n')	
		
		else :
			console.log(f"Received unknown opts request \"{lines[0]}\"")
			server.send(b'ERR\n\n')
def send_move_data(server):	
	msg = ''
	for key1 in ['move', 'cannon']:
		part = data[key1]['real']
		for key2 in part:
			obj = part[key2]
			
			if key2 == 'on' : msg += f"{key1},real,{key2};{'1' if obj.val else '0'}\n"
			else:
				if isinstance(obj.val, (list, np.ndarray)) : msg += f"{key1},real,{key2};{ ','.join([str(el) for el in obj.val]) }\n"
				else                         : msg += f"{key1},real,{key2};{str(obj.val)}\n"
	server.send(msg.encode('ascii'))
def send_auto_markers():
	msg = "SETAUTOMARKERS\n"
	mids = list(data['markers']['auto'].cells.keys())
	cornersAll = list(data['markers']['auto'].cells.values())
	for i in range(len(mids)) : msg += str(mids[i]) + ";;" + str.join(';', [str.join(',', [str(el) for el in corner]) for corner in cornersAll[i]]) + '\n';
	net.server_opts.send( (msg+'\n').encode('ascii') )
# update data from coms channel (remote)
def update_data(self, val):
	self.val = val
def update_move_vel(self, vel, fromprog=False):
	if not data['move']['auto']['on'].val:
		set_move_vel(vel)
		self.val = vel
		if not fromprog : timeouts['check_movedata'].refresh()
def toggle_move_auto(self, on):
	if on : timeouts['check_movedata'].disable()
	else  : timeouts['check_movedata'].enable()
	
	kit.motor1.throttle = 0
	kit.motor2.throttle = 0
	self.val = on
def toggle_canon_auto(self, on):
	self.val = on
def update_markers_type(self, mtype):
	global current_mobj
	self.val = mtype
	current_mobj = data['markers'][mtype]
	if mtype == 'auto' : send_auto_markers()
def update_markers(self, mtype, mids, cornersAll):
	for i in range(len(mids)) : self.cells[mids[i]] = cornersAll[i]
	self.board = aruco.Board_create(np.asarray(list(self.cells.values()), np.float32), aruco_dict, np.asarray(list(self.cells.keys()), int))
def update_auto_markers_size(self, msize):
	self.val = msize
	reset_auto_board()

def reset_auto_board():
	global current_mobj
	
	data['markers']['auto'] = newAutoBoard()
	if data['markers']['type'].val == 'auto':
		current_mobj = data['markers']['auto']
		send_auto_markers() # will send empty list of markers
def set_move_vel(vel):
	vel[1] *= -1
	data['move']['real']['vel'].val = vel
	kit.motor1.throttle = 0.9 if vel[0] > 0.9 else (-0.9 if vel[0] < -0.9 else vel[0]) 
	kit.motor2.throttle = 0.9 if vel[1] > 0.9 else (-0.9 if vel[1] < -0.9 else vel[1])
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

def newAutoBoard():
	return Object(
		cells = {}, cells_tmp = {}, cells_i = {}, # cells contains cells positioned relative to origin with smallest id, cells_tmp contains all cells
		board = None,                             # cells_i = cells info (in_refs, out_ref, etc..., ms = marker size, orig = origin id 
		orig = 9999
	)

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
			'speed': Object(val=0.3, onchange=update_data) 
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
	},
	'markers': {
		'type': Object(val='auto', onchange=update_markers_type),
		
		'auto_s': Object(val=0.035, onchange=update_auto_markers_size), # 5 centimeters by default, modifiable by control panel
		'auto': newAutoBoard(),
		
		'grid': Object(cells={}, board=None, onchange=update_markers) 
	}
};

timeouts = {
	'check_movedata': Timeout(1, partial(data['move']['com']['vel'].onchange, [0,0], True)) # set vel to 0 if we don't receive move data for extended amount of time and move is set to manual
}
if not data['move']['auto']['on'] : timeouts['check_movedata'].enable()

set_timer('stream_imgframe', 1/20) # 20 fps
set_timer('movedata', 1/10) # 10 fps
transfo = None
while True:
	timers_start()

	# read new camera frame
	if check_timer('movedata'):	
		ret, camera_frame = cap.read()
		if not ret: 
			print("Camera error, quitting...")
			cap.release()
			break
		
		camera_frame = fisheye_undistort(cameradata, camera_frame)
		
		# build marker board
		#if data['markers']['type'].val == 'auto':
		#	if auto_make_board(cameradata, camera_frame, data['markers']['auto'], data['markers']['auto_s'].val, aruco_dict):
		#		send_auto_markers()
		
		# compute tank pos, speed
		if current_mobj is not None:
			transfo = getBoardTransform(cameradata, camera_frame, current_mobj.board, aruco_dict, transfo)
			if transfo is not None:
				data['move']['real']['pos'].val = transfo[0]
				data['move']['real']['dir'].val = transfo[1]
				if data['move']['auto']['on'].val : auto_move()
	
	# stream camera
	if check_timer('stream_imgframe'):
		camera_jpegbytes = cv2.imencode('.jpeg', cv2.resize(camera_frame, (cam_sendW,cam_sendH)), [int(cv2.IMWRITE_JPEG_QUALITY), cam_quality])[1].tobytes()
		net.out_cam.send(camera_jpegbytes)
	
	net.server_opts.checkdead() # will disconnect if remote connection hasn't sent data in a while
	net.server_opts.connect() # will accept a connection if none is already established
	
	# handle received move message
	recv_move_data(net.inout_move)
	# handle received opts message
	recv_opts_data(net.server_opts)
	
	# send move messages
	if check_timer('movedata'):
		send_move_data(net.inout_move)
	
	
	#if cv2.waitKey(1) == ord('q') : break
	timers_end()
	for key in timeouts : timeouts[key].check()


# TODO:

#	- Ajouter code obstacles (obstacles via camera + ajout manuel via interface)
#	- use getBoardObjectAndImagePoints and solvePnP instead of estimatePoseBoard ?
# 	- optimize code:
#		- for ... in list(...dict...)
#		- use dict for url dispatcher ?
#	- handle timers differently ?
