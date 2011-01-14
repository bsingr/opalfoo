require 'opal'

# ## Task :opal
# 
# Rebuild the source files. By default this will build all ruby files in 'lib' 
# to 'javascripts', and will also watch that folder for changes to the given
# sources.
Opal::Rake::OpalTask.new do |opal|
  opal.source = 'lib'
  opal.destination = 'javascripts'
  opal.options  = '--watch'
end
