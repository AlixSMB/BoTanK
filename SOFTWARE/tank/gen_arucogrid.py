import numpy as np
import cv2
import cv2.aruco as aruco

from util import getGridMarkers # util.py 

bgimg = np.full((round(2000*210/297), 2000), 255)

scale = round(2000/8) # size of marker in pixels, better if proportional to number of internal bits (marker + margin bits)
nb_w = 4
nb_h = 3
margin = round(1/3 *scale)
startId = 201
aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
ids, corners = getGridMarkers(nb_w, nb_h, scale, margin, startId)

ids = [201]*6+[202]*6
for i in range(len(ids)):
	markerimg = aruco.drawMarker(aruco_dict, ids[i], scale)
	
	xl = int(corners[i][0][0])
	xr = int(corners[i][2][0])
	yt = int(corners[i][0][1])
	yb = int(corners[i][2][1])
	
	bgimg[yt:yb, xl:xr] = markerimg
	
	#while True:
	#	cv2.imshow("test", bgimg)
	#	if cv2.waitKey(0) == ord('q') : break

OUT_FILE=f"boards/aruco_grid-6X6_250-from{startId}_to{ids[i]}_w{nb_w}_h{nb_h}_s{scale}_m{margin}.png"
cv2.imwrite(OUT_FILE, bgimg)
print(f"Aruco grid written to \"{OUT_FILE}\"")
