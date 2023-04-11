import socket
import cv2

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

cap = cv2.VideoCapture(0)
print("Sending bytes...")
while(True):
	_, videoframe = cap.read()
	cv2.imshow('udp send', videoframe)
	jpegbytes = cv2.imencode('.jpeg', cv2.resize(videoframe, (100,100)))[1].tobytes()
	
	sock.sendto(jpegbytes, ('127.0.0.1', 81))
	
	if cv2.waitKey(1) == ord('q') : break
cv2.destroyAllWindows()
