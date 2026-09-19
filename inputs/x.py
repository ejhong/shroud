import numpy as np
from PIL import Image
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider

# Load the image and convert it to grayscale
image_path = "shrdfacn.jpg"  # Replace with your image file
image = Image.open(image_path).convert("L")

# Resize image for better performance (optional, adjust as needed)
#image = image.resize((300, 300), Image.ANTIALIAS)

# Convert the image to a NumPy array
image_array = np.array(image)

# Normalize pixel values to create a height map
height_map = image_array / 255.0  # Normalize to range 0.0 to 1.0

# Generate X and Y coordinate grids
x = np.linspace(0, height_map.shape[1], height_map.shape[1])
y = np.linspace(0, height_map.shape[0], height_map.shape[0])
x, y = np.meshgrid(x, y)

# Initialize plot
fig = plt.figure(figsize=(12, 8))
ax = fig.add_subplot(111, projection='3d')

# Initial Z-axis scaling (aspect ratio)
z_scale = 0.2

# Plot the initial 3D surface
surface = ax.plot_surface(
    x, y, height_map,
    cmap='viridis',  # Change colormap if desired
    edgecolor='none'
)

# Set axis labels and title
ax.set_title("Interactive 3D Height Map")
ax.set_xlabel("X Axis")
ax.set_ylabel("Y Axis")
ax.set_zlabel("Height")
ax.set_box_aspect([1, 1, z_scale])  # Initial Z-axis flattening

# Add a color bar
colorbar = fig.colorbar(surface, ax=ax, shrink=0.5, aspect=10)

# Function to update the Z-axis scaling dynamically
def update(val):
    global z_scale
    z_scale = slider.val
    ax.set_box_aspect([1, 1, z_scale])  # Dynamically adjust the Z-axis
    plt.draw()

# Add a slider for Z-axis scaling
slider_ax = plt.axes([0.2, 0.01, 0.6, 0.03], facecolor='lightgray')  # Slider position
slider = Slider(slider_ax, "Z-Axis Scale", 0.05, 1.0, valinit=z_scale)  # Slider range
slider.on_changed(update)

# Enable interactive rotation with mouse
def on_mouse_move(event):
    if event.button == 1:  # Left mouse button
        ax.view_init(elev=ax.elev - event.ydata * 0.1, azim=ax.azim + event.xdata * 0.1)
        plt.draw()

fig.canvas.mpl_connect('motion_notify_event', on_mouse_move)

# Show the interactive plot
plt.show()

