class OpalFoo
  def initialize(env = :development)
    @env = env
    Document.ready? do
      puts "Running #{self.class} at #{@env}"
      ready
    end
  end
  
  def ready
    Document["body"].first.html = "<div style='color:red;'>OpalFoo is really running!</div>"
  end
end

OpalFoo.new