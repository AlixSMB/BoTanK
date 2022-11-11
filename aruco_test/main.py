import urllib3
http = urllib3.PoolManager(timeout=6.0)
import cv2
import cv2.aruco as aruco
import numpy as np


class HTTPVideoStream:	
	def __init__(self, url):
		self.data = bytes()
		self.url = url
		try:
			self.con = http.request('GET', url, preload_content=False)
		except:
			raise Exception("can't connect to http video stream source")
		print(f"Connecting to \"{url}\" video stream...")

	def getFrameImg(self):
		while True:
			try:
				self.data += self.con.read(1024)
			except:
				raise Exception("can't receive http video stream")				
			# decode mjpeg (from stackoverflow)
			a = self.data.find( b'\xff\xd8' )
			b = self.data.find( b'\xff\xd9' )
			if a!=-1 and b!=-1:
				frame = self.data[a:b+2]
				self.data = self.data[b+2:]
				return cv2.imdecode( np.frombuffer(frame, dtype=np.uint8), cv2.IMREAD_COLOR)


aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
aruco_params = aruco.DetectorParameters_create()

httpvideo = HTTPVideoStream("http://192.168.1.7:8080/video/mjpeg")
while True:
	videoframe = httpvideo.getFrameImg()
	
	corners, ids = aruco.detectMarkers(videoframe, aruco_dict, parameters=aruco_params)
	if not ids is None : print(ids)
	videoframe = aruco.drawDetectedMarkers(videoframe, corners)
	
	cv2.imshow('videostream', videoframe)
	if cv2.waitKey(1) & 0xFF == ord('q') : break


cv2.destroyAllWindows()
