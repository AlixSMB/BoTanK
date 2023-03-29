import zmq
import cv2
import numpy as np

context = zmq.Context()
sock = context.socket(zmq.SUB)
sock.setsockopt(zmq.SUBSCRIBE, b'')
sock.connect("tcp://192.168.43.95:5555")
print("connected")
i=0
while i < 100:
	i+=1
	
	#frame = sock.recv_pyobj()
	frame = cv2.imdecode( np.frombuffer(sock.recv(), dtype=np.uint8), cv2.IMREAD_COLOR)
	
	print(frame.shape)
	
	cv2.imshow("cam", frame)
	cv2.waitKey(round(1/30*1000))

context.destroy()
