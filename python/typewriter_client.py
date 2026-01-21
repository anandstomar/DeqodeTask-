import sys
import time
import re
import os

# Set a small delay for the typewriter effect (in seconds)
# Adjust this value to speed up or slow down the typing.
# 0.02 is 20 milliseconds, which is a common speed.
TYPE_DELAY = 0.02

def stream_content_with_typewriter_effect():
    """
    Reads the raw text stream from stdin, prints content character-by-character,
    and handles the simple markers used for status updates.
    """
    # Regex to identify the status/control markers from the server
    marker_pattern = re.compile(r'\n--- (.*?) ---\n')
    
    # Check if a marker is in the input buffer
    input_buffer = ""
    
    for line in sys.stdin:
        input_buffer += line
        
        # Process markers first
        while (match := marker_pattern.search(input_buffer)):
            # Print any text BEFORE the marker instantly
            pre_text = input_buffer[:match.start()]
            if pre_text:
                for char in pre_text:
                    sys.stdout.write(char)
                    sys.stdout.flush()
                    time.sleep(TYPE_DELAY)
            
            # Print the marker to stderr to keep it separate from the main text
            marker = match.group(0).strip()
            print(f"\n{marker}", file=sys.stderr)
            
            # Remove the processed part from the buffer
            input_buffer = input_buffer[match.end():]

        # Process the remaining content in the buffer (which is just raw text)
        for char in input_buffer:
            sys.stdout.write(char)
            sys.stdout.flush()
            # Apply the typewriter delay to content characters
            time.sleep(TYPE_DELAY)
        
        # Clear the buffer after processing
        input_buffer = ""
    
    # Final newline for a clean prompt
    sys.stdout.write('\n')
    sys.stdout.flush()

if __name__ == "__main__":
    stream_content_with_typewriter_effect()