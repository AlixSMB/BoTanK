import numpy as np
import cv2
import cv2.aruco as aruco
import pickle

from util import Object, fisheye_undistort
from positioning import getInvTransformationMatrix


cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)

CAMERADATA_FILENAME = "laptopcam_fisheye_params_3"
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)


dictio = aruco.Dictionary_get(aruco.DICT_6X6_250)
detect_params = aruco.DetectorParameters_create()
estimate_param = aruco.EstimateParameters.create()
estimate_param.pattern = aruco.CW_top_left_corner


transfo = None
while True:
	videoframe = fisheye_undistort(cameradata, np.copy(cap.read()[1]))
	
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		aruco.drawDetectedMarkers(videoframe, corners, ids)
		
		retval, rvecs, tvecs, reprErr = cv2.solvePnPGeneric(np.array([[0,0,0], [0.035,0,0], [0.035,0.035,0], [0,0.035,0]], dtype=np.float32), corners[0][0], cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_IPPE)
		rvec = rvecs[1] ; tvec = tvecs[1]
		cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvec, tvec, 0.02)
		
		invTransfo = getInvTransformationMatrix(rvec, tvec)
		print(np.matmul(invTransfo, np.array([0,0,0,1]))[:3])
	
	cv2.imshow("image", videoframe)
	keycode = cv2.waitKey(round(1000/30))
	if keycode == ord('q') : break


# TODO: 
# try auto make board error correction -> compute reprojection error, 
