import urllib3
http = urllib3.PoolManager()
import cv2
import numpy as np

class HTTPVideoStream:	
	def __init__(self, url):
		self.data = bytes()
		self.url = url
		print(f"Connecting to \"{url}\" video stream...")
		self.con = http.request('GET', url, preload_content=False)

	def getFrameImg(self):
		while True:
			self.data += self.con.read(1024)			
			jpegstart = self.data.find( b'\xff\xd8' ) # start of jpeg data
			jpegend = self.data.find( b'\xff\xd9' ) # end of jpeg data
			if jpegstart != -1 and jpegend != -1:
				frame = self.data[jpegstart : jpegend+2]
				self.data = self.data[jpegend+2 :]
				return cv2.imdecode( np.frombuffer(frame, dtype=np.uint8), cv2.IMREAD_COLOR)

