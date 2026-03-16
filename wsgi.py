from app import create_app

app = create_app()

print("APP ROOT:", app.root_path)
print("TEMPLATE FOLDER:", app.template_folder)