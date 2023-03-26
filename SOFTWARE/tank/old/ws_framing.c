#include <stdint.h>

typedef struct {
	uint64_t start;
	uint64_t len;
	
	uint8_t fin;
	uint8_t type;
} Frame;

Frame decode_frame(uint8_t *msg){
	Frame frame;
	
	frame.fin = msg[0] & 0b10000000;
	frame.type = msg[0] & 0b00001111;
		
	uint64_t len = msg[1] & 0b01111111;
	uint32_t ind;
	if (len == 126){
		len = (msg[2] << 8) + msg[3];
		ind = 4;
	}
	else if (len == 127){
		len = ((uint64_t)msg[2] << (7*8)) | ((uint64_t)msg[3] << (6*8)) | ((uint64_t)msg[4] << (5*8)) | ((uint64_t)msg[5] << (4*8)) | ((uint64_t)msg[6] << (3*8)) | ((uint64_t)msg[7] << (2*8)) | ((uint64_t)msg[8] << (1*8)) | (uint64_t)msg[9];
		ind = 10;
	}
	else ind = 2;
	
	if ( msg[1] & 0b10000000 ){ // if mask
		uint8_t mask[4] = {msg[ind], msg[ind+1], msg[ind+2], msg[ind+3]}; ind+=4;
		for (uint32_t i=0; i<len; i+=1) msg[i+ind] ^= mask[i % 4];		
	}
	
	frame.start = ind; 
	frame.len = len;
	return frame;
}
