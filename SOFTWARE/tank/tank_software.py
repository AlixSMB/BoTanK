# Note for windows CMD: if QuickEdit mode is enabled, clicking the console freezes the script until a keyboard key is pressed... 

from util import * # util.py
from positioning import getBoardTransform # positioning.py

import cv2
import numpy as np
#from adafruit_motorkit import MotorKit
#kit = MotorKit()
kit = Object(motor1=Object(throttle=0), motor2=Object(throttle=0))
import math
import time

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
	'appsink'.format(
			width=camW,
			height=camH,
			fps=60,
			capture_width=camW,
			capture_height=camH
	)
#cap = cv2.VideoCapture(GST_STRING, cv2.CAP_GSTREAMER) #VideoCapture(GST_STRING, cv2.CAP_GSTREAMER) # from util.py [!]
cap = cv2.VideoCapture(0) #VideoCapture(0)

#cap.set(cv2.CAP_PROP_EXPOSURE, -5) # set to 0.25 auto-adjust
print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
print(f"Video FPS: {cap.get(cv2.CAP_PROP_FPS)}")
#print(f"Video exposure: {cap.get(cv2.CAP_PROP_EXPOSURE)}")

ADDR_CTRLPANEL = "127.0.0.1"#"10.7.252.45"
print(f"Control panel IP set to {ADDR_CTRLPANEL}")
PORT_CAM = 81
PORT_OPTS = 82
PORT_COMS_IN = 82
PORT_COMS_OUT = 83
net = Object(
	out_cam = UDP(ADDR_CTRLPANEL, None, PORT_CAM),
	inout_move = UDP(ADDR_CTRLPANEL, PORT_COMS_IN, PORT_COMS_OUT),
	server_opts = TCPServer(ADDR_CTRLPANEL, PORT_OPTS)
)

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
			for i in range(len(vals)) : vals[i] = float(vals[i])
			if len(vals) == 1 : obj.onchange(vals[0])
			else              : obj.onchange(vals)
def recv_move_data(msg):
	recv_setdata(msg.decode('ascii').split('\n'))
def recv_opts_data(server, msg):
	for part in msg.decode('ascii').split('\n\n'):
		if part == '' : continue
		
		lines = part.split('\n')
		if lines[0] == 'GET':
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
		
		else: # heartbeat
			server.send(b'OK\n\n')
def send_move_data(server):	
	msg = ''
	for key1 in data:
		part = data[key1]['real']
		for key2 in part:
			obj = part[key2]
			
			if key2 == 'on' : msg += f"{key1},real,{key2};{'1' if obj.val else '0'}\n"
			else:
				if isinstance(obj.val, list) : msg += f"{key1},real,{key2};{ ','.join([str(el) for el in obj.val]) }\n"
				else                         : msg += f"{key1},real,{key2};{str(obj.val)}\n"
	server.send(msg.encode('ascii'))

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
# update real data
def set_move_vel(vel):
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

timeouts = {
	'check_movedata': Timeout(1, partial(data['move']['com']['vel'].onchange, [0,0], True)) # set vel to 0 if we don't receive move data for extended amount of time and move is set to manual
}
if not data['move']['auto']['on'] : timeouts['check_movedata'].enable()

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

set_timer('stream_imgframe', 1/20) # 20 fps
set_timer('stream_movedata', 1/10) # 10 fps
while True:
	timers_start()
	
	# read new camera frame
	ret, camera_frame = cap.read()
	if not ret: 
		print("Camera error, quitting...")
		cap.release()
		break
	#cv2.imshow('videostream', camera_frame)
	
	# stream camera
	if check_timer('stream_imgframe'):
		camera_jpegbytes = cv2.imencode('.jpeg', cv2.resize(camera_frame, (cam_sendW,cam_sendH)), [int(cv2.IMWRITE_JPEG_QUALITY), cam_quality])[1].tobytes()
		net.out_cam.send(camera_jpegbytes)
	
	# compute tank pos, speed
	transfo = getBoardTransform(camera_frame)
	if transfo is not None:
		data['move']['real']['pos'].val = transfo[0]
		data['move']['real']['dir'].val = transfo[1]
		
		if data['move']['auto']['on'].val : auto_move()
	
	net.server_opts.checkdead() # will disconnect if remote connection hasn't sent data in a while
	net.server_opts.connect() # will accept a connection if none is already established
	
	# handle received move message
	msg = net.inout_move.recv()
	if msg != None : recv_move_data(msg)
	print(data['move']['com']['vel'].val)
	# handle received opts message
	msg = net.server_opts.recv()
	if msg != None : recv_opts_data(net.server_opts, msg)
	
	# send move messages
	if check_timer('stream_movedata'):
		send_move_data(net.inout_move)
	
	
	#if cv2.waitKey(1) == ord('q') : break
	timers_end()
	for key in timeouts : timeouts[key].check()


# TODO:

#	- Ajouter code obstacles (obstacles via camera + ajout manuel via interface)

#	- check regularly that vel data is received if vel is set to something other than 0,0
# 	- optimize code:
#		- for ... in list(...dict...)
#		- use dict for url dispatcher ?
#	- handle timers differently ?
