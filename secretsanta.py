#!/usr/bin/env python

import smtplib
import string
from getpass import getpass
from sys import argv
from random import randint, shuffle
from os.path import *

dir, script = split(argv[0])
usage_error = False

# pairing constraints (asymmetric relation)
# ex. not_allowed = { "Bob":"Mary", "Mary":"Bob" }
not_allowed = {}

#check args
if len(argv) < 2:
	# we at least need the input list
	usage_error = True
elif len(argv) < 3:
	# default to the current directory if none provided
	print "Warning: No output directory provided. Using \"%s\"\n" % dir
	output_dir = dir
elif len(argv) == 3:
	# make sure the output directory exists
	if isdir(argv[2]):
		output_dir = realpath(argv[2])
	else:
		print "Error: Invalid output directory!"
		usage_error = True
else:
	# unexpected number of arguments
	print "Error: Invalid number of arguments!"
	usage_error = True

if not usage_error:
	# make sure the input file exists
	if not isfile(argv[1]):
		print "Error: Specified input file does not exist!"
		usage_error = True
	else:
		input_file = realpath(argv[1])

if usage_error:
	print "usage: python %s input_list.txt output_dir" % script
	exit()

# if we got here, everything is niffy-spiffy so far
print "input_file = \"%s\"\noutput_dir = \"%s\"" % (input_file, output_dir)

lines =  map(string.strip, file(input_file, "r").readlines())
names = []
for entry in lines:
	names.append(string.split(entry, "\t"))
print "\nInput list:"
for entry in names:
	print "\t%s (%s)" % (entry[0], entry[1])

loop_guard = 0
valid_order = False

while loop_guard < 10 and not valid_order:
	sorted_names = names[:] # make a copy in case we need the originial list later
	shuffle(sorted_names)
	
	print "\nList shuffled. Checking for valid ordering:",
	
	first = current = sorted_names.pop()
	pairs = []
	valid_order = True
	while sorted_names:
		next = sorted_names.pop()
		
		if not_allowed.has_key(current[0]):
			if not_allowed[current[0]] == next[0]:
				print "MATCH NOT ALLOWED: %s => %s" % (current[0], next[0])
				valid_order = False
				break
		pairs.append((current, next))
		current = next

	if valid_order:
		if not_allowed.has_key(current[0]):
			if not_allowed[current[0]] == first[0]:
				print "MATCH NOT ALLOWED: %s => %s" % (current[0], first[0])
				valid_order = False
		pairs.append((current, first))
	
	loop_guard += 1
	if valid_order:
		print "VALID ORDER!"

if not valid_order:
	print "\nERROR: The list was shuffled %d times without finding a valid ordering.\nPlease double-check that a valid ordering is possible given the following constraints:" % loop_guard
	for p1 in not_allowed:
		print "\t%s => %s NOT ALLOWED" % (p1, not_allowed[p1])
	exit()

if raw_input("\nDisplay matches (Y/N)? ").lower() == "y":
	for p1, p2 in pairs:
		print "\t%s => %s " % (p1[0], p2[0])

if raw_input("\nWrite matches to disk (will overwrite existing files) (Y/N)? ").lower() == "y":
	for p1, p2 in pairs:
		out = file(join(output_dir, p1[0] + ".txt"), "w")
		out.write(p2[0])
		out.close()

sendmail = raw_input("\nSend emails (Y/N)?: ")
if sendmail.lower() == "y":
	
	debug = raw_input("Debug mode (doesn't actually send) (Y/N)?: ")
	from_address = raw_input("From Address: ")
	
	if debug.lower() == "n":
		print "\nPrepping to send email..."
		smtp = raw_input("SMTP Server: ")
		username = raw_input("Username: ")
		password = getpass()
	
		s = smtplib.SMTP(smtp)
		#s.set_debuglevel(1)
		s.ehlo()
		s.starttls()
		s.ehlo()
		s.login(username, password)
	
	for to, match in pairs:
		to_name, to_address = to
		match_name, match_address = match
	
		subject = "{0}{1} Secret Santa Assignment...".format(
			to_name,
			"'" if to_name.endswith("s") else "'s"
		)
	
		headers = "From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n" % (from_address, to_address, subject)
		message = headers + "Hey %s,\n\nYour Secret Santa is: %s!\n\nShhh...don't tell anyone! ;)\n\n-Santa's little helper\n\nP.S. This was sent by one of Santa's elves (an automated program). So please don't reply to this email...cuz then that elf will know who your secret santa is too...which would make that elf very, very sad and they would cry little elf-tears. So yeah...ix-nay on the eply-ray.\n\nOh, and if you should happen to lose this email or forget who your secret santa is you can email me (real Dane, not elf-Dane) and I can send you a file with your match without me having to know who you have. And yes, this is overly complicated. YAY CHRISTMAS!" % (to_name, match_name)
	
		if debug.lower() == "y":
			print "\n" + message
	
		if debug.lower() == "n":
			s.sendmail(from_address, to_address, message)

	if debug.lower() == "n":
		s.close()
