FROM atmoz/sftp

# Skapa användare "user" med lösenord "secretpass", mappar till /upload
# Syntax: användare:lösenord:::mapp
RUN mkdir -p /home/user/upload
RUN chown -R 1000:100 /home/user/upload
CMD ["user:secretpass:::upload"]
