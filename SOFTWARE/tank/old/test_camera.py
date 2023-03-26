import socket
import zmq 
import cv2
import numpy as np


# receive camera feed
#gstreamer_pipeline = "nvarguscamerasrc sensor-mode=3 ! video/x-raw(memory:NVMM), width=1640, height=1232, format=(string)NV12, framerate=(fraction)30/1 ! nvvidconv ! video/x-raw, width=(int)1640, height=(int)1232, format=(string)BGRx ! videoconvert ! appsink"
#gstCamera = GstCamera(width=1920, height=1080, fps=30)
#gstCamera.start()
GST_STRING = \
	'nvarguscamerasrc ! '\
	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
	'nvvidconv ! '\
	'video/x-raw, width=(int){width}, height=(int){height}, format=(string)BGRx ! '\
	'videoconvert ! '\
	'video/x-raw, format=(string)BGR ! '\
	'appsink'.format(
		width=1280,
		height=720,
		fps=60,
		capture_width=1280,
		capture_height=720
	)
cap = cv2.VideoCapture(GST_STRING, cv2.CAP_GSTREAMER)
#cap = cv2.VideoCapture("videotest.mp4")


# sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
# sock.bind(('', 8082))
# sock.listen()
# rsock, addr = sock.accept()




context = zmq.Context()
socket = context.socket(zmq.PUB)

socket.bind("tcp://127.0.0.1:5555")



while True:
	try:
		# read new camera frame
		#camera_frame = gstCamera.image
		ret, camera_frame = cap.read()
		if not ret: 
			print("Camera error, abort")
			break
		#cv2.imshow('videostream', camera_frame)
	
		socket.send_pyobj(camera_frame)

		cv2.waitKey(round(1/30*1000))
	except:
		socket.close()	
		break

