import socket
import cv2
import numpy as np

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", 81))

print("Receiving bytes...")
while(True):
	jpegbytes = sock.recvfrom(4096*8)[0]
	cv2.imshow('udp recv', cv2.imdecode(np.frombuffer(jpegbytes, dtype=np.uint8), cv2.IMREAD_COLOR))
		
	if cv2.waitKey(1) == ord('q') : break
cv2.destroyAllWindows()
